/**
 * Batched sampled market-cap worker. DexScreener marketCap is an estimate,
 * not a price oracle and not a guarantee of complete Pump.fun coverage.
 */
import { FableStore } from "./storage.js";
import { fetchDexObservations, MarketRateLimitError } from "./market-provider.js";
const store=new FableStore(process.env.DATABASE_URL??"");
await store.init();
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const batchIntervalMs=Math.max(30000,Number(process.env.MARKET_REQUEST_INTERVAL_MS??30000));
if(!Number.isFinite(batchIntervalMs))throw new Error("Invalid market sampling interval");
let active=true;
process.once("SIGTERM",()=>{active=false;});
process.once("SIGINT",()=>{active=false;});
while(active){
  try{
    const tokens=await store.dueTokens(20);
    if(!tokens.length){await sleep(15000);continue;}
    let delay=batchIntervalMs;
    try {
      const samples=await fetchDexObservations(tokens.map(x=>x.mint));
      const byMint=new Map(samples.map(x=>[x.mint,x]));
      for(const token of tokens){
        const sample=byMint.get(token.mint);
        if(!sample){await store.deferToken(token.mint,600);continue;}
        const event=await store.recordPrice({...sample,source:"dexscreener"});
        if(event)process.stdout.write(JSON.stringify({
          event,mint:token.mint,symbol:token.symbol,
          marketCapUsd:sample.marketCapUsd,poolLiquidityUsd:sample.poolLiquidityUsd,
          poolAddress:sample.poolAddress,observedAt:sample.observedAt.toISOString(),
          crossingType:event==="crossed_up"?"observed_between_samples":"first_seen_above",
          optionsAvailable:false,source:"dexscreener",settlementOracle:false
        })+"\n");
      }
    }catch(error){
      const limited=error instanceof MarketRateLimitError;
      delay=limited?error.delayMs:Math.max(batchIntervalMs,60000);
      for(const token of tokens)await store.deferToken(token.mint,Math.ceil(delay/1000));
      process.stderr.write("[fable] market batch sampling failed: "+String(error)+"\n");
    }
    await sleep(delay);
  }catch(error){
    process.stderr.write("[fable] worker error: "+String(error)+"\n");
    await sleep(30000);
  }
}
await store.close();
