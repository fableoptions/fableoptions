/** Sampled market-cap worker; not a guaranteed real-time stream or settlement oracle. */
import { FableStore } from "./storage.js";
const store = new FableStore(process.env.DATABASE_URL ?? "");
await store.init();
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve,ms));
const apiRoot = "https://api.geckoterminal.com/api/v2/networks/solana/tokens";
const requestIntervalMs = Math.max(30000,Number(process.env.MARKET_REQUEST_INTERVAL_MS ?? 30000));
if (!Number.isFinite(requestIntervalMs)) throw new Error("Invalid rate limit configuration");
type Pool = { attributes?: { address?: string; market_cap_usd?: string|number|null; reserve_in_usd?: string|number|null } };
class RateLimitError extends Error { constructor(public retryMs: number) { super("GeckoTerminal rate limited"); } }
async function bestPool(mint: string) {
  const response=await fetch(`${apiRoot}/${encodeURIComponent(mint)}/pools?page=1`, {
    headers: {accept:"application/json"},signal:AbortSignal.timeout(12000)
  });
  if(response.status===429){
    const retry=Number(response.headers.get("retry-after"));
    throw new RateLimitError(Number.isFinite(retry)&&retry>0 ? Math.max(60000,retry*1000) : 120000);
  }
  if(!response.ok)throw new Error(`GeckoTerminal HTTP ${response.status}`);
  const body=await response.json() as {data?:Pool[]};
  return (body.data??[]).map(pool=>({
    poolAddress:pool.attributes?.address??"",
    cap:pool.attributes?.market_cap_usd == null ? NaN : Number(pool.attributes.market_cap_usd),
    liquidity:pool.attributes?.reserve_in_usd == null ? null : Number(pool.attributes.reserve_in_usd)
  })).filter(x=>x.poolAddress && Number.isFinite(x.cap) && x.cap>0)
    .sort((a,b)=>(b.liquidity??0)-(a.liquidity??0))[0];
}
let running=true;
process.once("SIGTERM",()=>{running=false;});
process.once("SIGINT",()=>{running=false;});
while(running){
  try {
    const tokens=await store.dueTokens(5);
    if(!tokens.length){await sleep(15000);continue;}
    for(const token of tokens){
      if(!running)break;
      let delay=requestIntervalMs;
      try {
        const pool=await bestPool(token.mint);
        if(!pool)await store.deferToken(token.mint,600);
        else{
          const event=await store.recordPrice({
            mint:token.mint,marketCapUsd:pool.cap,poolLiquidityUsd:pool.liquidity,
            poolAddress:pool.poolAddress,observedAt:new Date()
          });
          if(event)process.stdout.write(JSON.stringify({
            event,mint:token.mint,symbol:token.symbol,marketCapUsd:pool.cap,
            poolLiquidityUsd:pool.liquidity,optionsAvailable:false,source:"geckoterminal"
          })+"\n");
        }
      }catch(error){
        const limited=error instanceof RateLimitError;
        delay=limited ? error.retryMs : requestIntervalMs;
        await store.deferToken(token.mint,limited?Math.ceil(delay/1000):600);
        process.stderr.write(`[fable] sample failed (${limited?"rate_limit":"other"}): ${String(error)}; pausing ${delay}ms\n`);
        if(limited){await sleep(delay);break;}
      }
      await sleep(delay);
    }
  }catch(err){process.stderr.write(`[fable] market worker error: ${String(err)}\n`);await sleep(15000);}
}
await store.close();
