import { PersistentTracker } from "./persistent-tracker.js";
import type { Observation } from "./crossings.js";

type Pool = {
  attributes?: { address?: string; name?: string; market_cap_usd?: string | number | null };
  relationships?: { base_token?: { data?: { id?: string } } };
};
const root = "https://api.geckoterminal.com/api/v2";
const interval = Number(process.env.POLL_INTERVAL_MS ?? 30000);
const threshold = Number(process.env.THRESHOLD_USD ?? 300000);
const maxTracked = Number(process.env.MAX_TRACKED_PER_CYCLE ?? 20);
const pages = Number(process.env.GECKO_PAGES ?? 2);
if (!Number.isFinite(interval) || interval < 10000 || !Number.isInteger(maxTracked) || maxTracked < 0 || maxTracked > 100) throw new Error("Invalid configuration");
const tracker = new PersistentTracker(process.env.STATE_FILE ?? "data/tokens.json", threshold);
await tracker.load();
let cursor = 0;
let busy = false;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function getPools(url: string): Promise<Pool[]> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const body = await res.json() as { data?: Pool[] };
  return Array.isArray(body.data) ? body.data : [];
}
function parse(pool: Pool): Observation | null {
  const id = pool.relationships?.base_token?.data?.id;
  const mint = id?.startsWith("solana_") ? id.slice(7) : null;
  const cap = pool.attributes?.market_cap_usd == null ? NaN : Number(pool.attributes.market_cap_usd);
  if (!mint || !pool.attributes?.address || !Number.isFinite(cap) || cap <= 0) return null;
  return { mint, marketCapUsd: cap, symbol: pool.attributes.name?.split(" / ")[0] || "UNKNOWN", poolAddress: pool.attributes.address, observedAt: new Date().toISOString() };
}
async function run() {
  if (busy) return;
  busy = true;
  try {
    const observations = new Map<string, Observation>();
    for (let page = 1; page <= pages; page++) {
      const pools = await getPools(`${root}/networks/solana/new_pools?page=${page}`);
      for (const pool of pools) { const item = parse(pool); if (item) observations.set(item.mint, item); }
    }
    const mints = tracker.trackedMints();
    const batch = mints.length ? Array.from({ length: Math.min(maxTracked, mints.length) }, (_, i) => mints[(cursor + i) % mints.length]) : [];
    cursor = mints.length ? (cursor + batch.length) % mints.length : 0;
    for (const mint of batch) {
      if (observations.has(mint)) continue;
      try {
        const pools = await getPools(`${root}/networks/solana/tokens/${encodeURIComponent(mint)}/pools?page=1`);
        const matching = pools.map(parse).filter((x): x is Observation => x !== null && x.mint === mint);
        matching.sort((a, b) => b.marketCapUsd - a.marketCapUsd);
        if (matching[0]) observations.set(mint, matching[0]);
      } catch (error) { process.stderr.write(`[fable] token refresh failed ${mint}: ${String(error)}\n`); }
      await wait(250);
    }
    for (const item of observations.values()) {
      const event = tracker.observe(item);
      if (event) process.stdout.write(JSON.stringify({ event: "token_discovery", ...event, verifiedPumpFunOrigin: false, optionsAvailable: false }) + "\n");
    }
    await tracker.save();
    process.stderr.write(`[fable] observed ${observations.size} tokens, tracking ${tracker.trackedMints().length}\n`);
  } catch (error) { process.stderr.write(`[fable] scan error: ${String(error)}\n`); }
  finally { busy = false; }
}
await run();
setInterval(() => void run(), interval);
