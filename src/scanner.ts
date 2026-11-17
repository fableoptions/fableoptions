import { CrossingTracker, type Observation } from "./crossings.js";

type ApiPool = {
  id?: string;
  attributes?: {
    address?: string;
    name?: string;
    market_cap_usd?: string | number | null;
    base_token_price_usd?: string | null;
  };
  relationships?: { base_token?: { data?: { id?: string } } };
};
type ApiResponse = { data?: ApiPool[] };

const threshold = Number(process.env.THRESHOLD_USD ?? 300000);
const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? 30000);
const pages = Math.min(10, Math.max(1, Number(process.env.GECKO_PAGES ?? 2)));
if (!Number.isFinite(intervalMs) || intervalMs < 10000) throw new Error("POLL_INTERVAL_MS must be >= 10000");
const tracker = new CrossingTracker(threshold);
const endpoint = "https://api.geckoterminal.com/api/v2/networks/solana/new_pools";
let running = false;

async function fetchPools(page: number): Promise<ApiPool[]> {
  const url = new URL(endpoint);
  url.searchParams.set("page", String(page));
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`GeckoTerminal HTTP ${response.status} on page ${page}`);
  const data = (await response.json()) as ApiResponse;
  return Array.isArray(data.data) ? data.data : [];
}

function normalize(pool: ApiPool): Observation | null {
  const mintId = pool.relationships?.base_token?.data?.id;
  const mint = mintId?.startsWith("solana_") ? mintId.slice("solana_".length) : null;
  const capRaw = pool.attributes?.market_cap_usd;
  const cap = capRaw == null ? NaN : Number(capRaw);
  const poolAddress = pool.attributes?.address;
  if (!mint || !poolAddress || !Number.isFinite(cap) || cap <= 0) return null;
  const symbol = pool.attributes?.name?.split(" / ")[0]?.trim() || "UNKNOWN";
  return { mint, symbol, marketCapUsd: cap, observedAt: new Date().toISOString(), poolAddress };
}

async function scan(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const all: Observation[] = [];
    for (let page = 1; page <= pages; page++) {
      const pools = await fetchPools(page);
      for (const pool of pools) {
        const item = normalize(pool);
        if (item) all.push(item);
      }
    }
    // One observation per mint per scan, preferring the pool with the highest reported cap.
    const unique = new Map<string, Observation>();
    for (const item of all) {
      if (!unique.has(item.mint) || item.marketCapUsd > unique.get(item.mint)!.marketCapUsd) unique.set(item.mint, item);
    }
    for (const item of unique.values()) {
      const event = tracker.observe(item);
      if (event) process.stdout.write(JSON.stringify({ event: "token_discovery", ...event, verifiedPumpFunOrigin: false, optionsAvailable: false }) + "\n");
    }
    process.stderr.write(`[fable] scanned ${unique.size} mints at ${new Date().toISOString()}\n`);
  } catch (error) {
    process.stderr.write(`[fable] scan failed: ${String(error)}\n`);
  } finally {
    running = false;
  }
}
await scan();
setInterval(() => void scan(), intervalMs);
