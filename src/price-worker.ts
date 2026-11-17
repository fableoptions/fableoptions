/**
 * Sampled market-cap watcher. Not exhaustive or a settlement oracle.
 * Only tracks tokens previously decoded and stored by the Pump.fun launch worker.
 */
import { FableStore } from "./storage.js";
const store = new FableStore(process.env.DATABASE_URL ?? "");
await store.init();
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const source = "https://api.geckoterminal.com/api/v2/networks/solana/tokens";
type Pool = { attributes?: { address?: string; market_cap_usd?: string | number | null; reserve_in_usd?: string | number | null } };
async function bestPool(mint: string) {
  const response = await fetch(`${source}/${encodeURIComponent(mint)}/pools?page=1`, {
    headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`GeckoTerminal HTTP ${response.status}`);
  const data = await response.json() as { data?: Pool[] };
  return (data.data ?? []).map(p => ({
    poolAddress: p.attributes?.address ?? "",
    cap: p.attributes?.market_cap_usd == null ? NaN : Number(p.attributes.market_cap_usd),
    liquidity: p.attributes?.reserve_in_usd == null ? null : Number(p.attributes.reserve_in_usd)
  })).filter(p => p.poolAddress && Number.isFinite(p.cap) && p.cap > 0)
    .sort((a,b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))[0];
}
let running = true;
process.once("SIGTERM", () => { running = false; });
process.once("SIGINT", () => { running = false; });
while (running) {
  try {
    const tokens = await store.dueTokens(10);
    if (!tokens.length) { await sleep(15000); continue; }
    for (const token of tokens) {
      if (!running) break;
      try {
        const pool = await bestPool(token.mint);
        if (!pool) await store.deferToken(token.mint, 300);
        else {
          const event = await store.recordPrice({
            mint:token.mint,marketCapUsd:pool.cap,poolLiquidityUsd:pool.liquidity,
            poolAddress:pool.poolAddress,observedAt:new Date()
          });
          if (event) process.stdout.write(JSON.stringify({
            event, mint:token.mint,symbol:token.symbol,marketCapUsd:pool.cap,
            poolLiquidityUsd:pool.liquidity,optionsAvailable:false,source:"geckoterminal"
          })+"\n");
        }
      } catch (err) {
        await store.deferToken(token.mint, 600);
        process.stderr.write(`[fable] market sample failed: ${String(err)}\n`);
      }
      await sleep(6000); // Conservative sampling against a public API; not near-complete coverage.
    }
  } catch (err) {
    process.stderr.write(`[fable] monitoring failed: ${String(err)}\n`);
    await sleep(15000);
  }
}
await store.close();
