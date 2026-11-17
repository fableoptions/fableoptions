/**
 * Experimental Pump.fun program-activity collector.
 * Requires a verified program ID and a Solana WebSocket RPC URL.
 * This collects transaction signatures only; it does NOT identify launches,
 * token mints, or threshold crossings.
 */
const url = process.env.SOLANA_WS_URL ?? (process.env.HELIUS_API_KEY ? `wss://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}` : undefined);
const programId = process.env.PUMP_PROGRAM_ID;
if (!url || !/^wss:\/\//.test(url)) throw new Error("Set HELIUS_API_KEY locally or SOLANA_WS_URL to a trusted wss:// Solana RPC endpoint");
if (!programId || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(programId)) throw new Error("Set PUMP_PROGRAM_ID to a verified Solana program address");
const reconnectMs = 3000;
let stopped = false;
const seen = new Set<string>();
function connect() {
  if (stopped) return;
  const ws = new WebSocket(url!);
  let subscriptionId: number | undefined;
  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "logsSubscribe", params: [{ mentions: [programId] }, { commitment: "confirmed" }] }));
    process.stderr.write("[fable] subscribed to program activity\n");
  });
  ws.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(String(event.data)) as {
        result?: number;
        method?: string;
        params?: { result?: { value?: { signature?: string; err?: unknown; logs?: string[] }; context?: { slot?: number } } };
        error?: unknown;
      };
      if (data.error) { process.stderr.write("[fable] subscription error " + JSON.stringify(data.error) + "\n"); return; }
      if (typeof data.result === "number") subscriptionId = data.result;
      if (data.method !== "logsNotification") return;
      const value = data.params?.result?.value;
      if (!value?.signature || value.err) return;
      if (seen.has(value.signature)) return;
      seen.add(value.signature);
      if (seen.size > 10000) seen.clear();
      process.stdout.write(JSON.stringify({ event: "program_activity", signature: value.signature, slot: data.params?.result?.context?.slot, programId, launchVerified: false }) + "\n");
    } catch (err) { process.stderr.write("[fable] malformed event: " + String(err) + "\n"); }
  });
  ws.addEventListener("error", () => process.stderr.write("[fable] websocket error\n"));
  ws.addEventListener("close", () => {
    process.stderr.write("[fable] disconnected; reconnect scheduled; events may have been missed\n");
    if (!stopped) setTimeout(connect, reconnectMs);
  });
  process.once("SIGINT", () => {
    stopped = true;
    if (subscriptionId !== undefined && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "logsUnsubscribe", params: [subscriptionId] }));
    }
    ws.close();
    process.exit(0);
  });
}
connect();
