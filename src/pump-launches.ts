import { decodeLaunches, PUMP_PROGRAM_ID, type ParsedTx } from "./pump-decode.js";
import { FableStore } from "./storage.js";

const key = process.env.HELIUS_API_KEY;
const store = process.env.DATABASE_URL ? new FableStore(process.env.DATABASE_URL) : null;
if (store) await store.init();
else process.stderr.write("[fable] DATABASE_URL absent; decoded launches will NOT be persisted\n");
const wsUrl = process.env.SOLANA_WS_URL ?? (key ? `wss://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}` : "");
const rpcUrl = process.env.SOLANA_RPC_URL ?? (key ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}` : "");
if (!wsUrl.startsWith("wss://") || !rpcUrl.startsWith("https://")) throw new Error("Configure HELIUS_API_KEY or secure Solana RPC URLs");

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const seen = new Set<string>();
const queue: string[] = [];
let shuttingDown = false;
let ws: WebSocket | undefined;
let nextRequestAt = 0;
let requestBackoffUntil = 0;
let dropped = 0;

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const now = Date.now();
  await sleep(Math.max(0, nextRequestAt - now, requestBackoffUntil - now));
  nextRequestAt = Date.now() + 1200; // Conservative throttle, not a guarantee of provider quota.
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000)
  });
  if (res.status === 429) {
    const retrySeconds = Number(res.headers.get("retry-after"));
    const backoff = Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : 60000;
    requestBackoffUntil = Date.now() + Math.min(Math.max(backoff, 10000), 180000);
    throw new Error("RATE_LIMITED");
  }
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json() as { result?: unknown; error?: { code?: number; message?: string } };
  if (json.error?.code === 429 || json.error?.code === -32005) {
    requestBackoffUntil = Date.now() + 60000;
    throw new Error("RATE_LIMITED");
  }
  if (json.error) throw new Error(`RPC error ${json.error.code ?? "unknown"}`);
  return json.result;
}

async function processSignature(signature: string) {
  for (let attempt = 0; attempt < 4 && !shuttingDown; attempt++) {
    try {
      const result = await rpc("getTransaction", [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 1 }]);
      if (result) {
        for (const launch of decodeLaunches(result as ParsedTx)) {
          if (store) await store.recordLaunch(launch);
          process.stdout.write(JSON.stringify({
            event: "pump_launch", ...launch, verifiedInstruction: true,
            marketCapUsd: null, optionsAvailable: false
          }) + "\n");
        }
        return;
      }
      await sleep(700 * (attempt + 1));
    } catch (error) {
      if (String(error).includes("RATE_LIMITED")) {
        process.stderr.write("[fable] Helius rate limit hit; backing off; missed activity needs backfill\n");
        return;
      }
      if (attempt === 3) process.stderr.write(`[fable] transaction fetch failed: ${String(error)}\n`);
      else await sleep(1500 * (attempt + 1));
    }
  }
}

async function drain() {
  while (!shuttingDown) {
    const signature = queue.shift();
    if (signature) await processSignature(signature);
    else await sleep(200);
  }
}
function connect() {
  if (shuttingDown) return;
  const socket = new WebSocket(wsUrl);
  ws = socket;
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "logsSubscribe",
      params: [{ mentions: [PUMP_PROGRAM_ID] }, { commitment: "confirmed" }]
    }));
    process.stderr.write("[fable] connected to Solana logs stream\n");
  });
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as {
        method?: string;
        error?: { message?: string };
        params?: { result?: { value?: { signature?: string; err?: unknown; logs?: string[] } } };
      };
      if (message.error) {
        process.stderr.write("[fable] logs subscription rejected: " + (message.error.message ?? "unknown") + "\n");
        return;
      }
      const value = message.params?.result?.value;
      if (message.method !== "logsNotification" || !value?.signature || value.err) return;
      // Only fetch transactions whose logs indicate token creation.
      if (!value.logs?.some(line => /Instruction: Create(?:V2)?(?:\b|$)/i.test(line))) return;
      if (seen.has(value.signature)) return;
      seen.add(value.signature);
      if (seen.size > 50000) seen.clear();
      if (queue.length >= 1000) {
        dropped++;
        if (dropped % 100 === 1) process.stderr.write(`[fable] queue saturated: ${dropped} dropped; historical backfill required\n`);
        return;
      }
      queue.push(value.signature);
    } catch {
      process.stderr.write("[fable] malformed notification\n");
    }
  });
  socket.addEventListener("error", () => process.stderr.write("[fable] websocket error\n"));
  socket.addEventListener("close", () => {
    if (!shuttingDown) {
      process.stderr.write("[fable] stream disconnected; historical backfill required\n");
      setTimeout(connect, 5000);
    }
  });
}
process.on("SIGTERM", () => { shuttingDown = true; ws?.close(); void store?.close(); });
process.on("SIGINT", () => { shuttingDown = true; ws?.close(); void store?.close(); });
void drain();
connect();
