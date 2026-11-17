/**
 * Read-only sampled market-cap worker.
 * DEX pool observations are preferred when available; newly created,
 * SOL-quoted non-Mayhem Pump curves use verified onchain reserve estimates.
 * Neither source is a derivatives settlement oracle.
 */
import { FableStore } from "./storage.js";
import { fetchDexObservations, MarketRateLimitError } from "./market-provider.js";
import { fetchPumpCurveSnapshots, fetchSolUsd } from "./pump-curve-provider.js";
import { fetchOwnershipAudit } from "./options/ownership-audit.js";
import { fetchLaunchSlot } from "./options/launch-slot-analysis.js";
const store=new FableStore(process.env.DATABASE_URL??"");
await store.init();
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const batchIntervalMs=Math.max(30000,Number(process.env.MARKET_REQUEST_INTERVAL_MS??30000));
if(!Number.isFinite(batchIntervalMs))throw new Error("Invalid market sampling interval");
const key=process.env.HELIUS_API_KEY;
const rpcUrl=process.env.SOLANA_RPC_URL??(key?`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`:"");
let active=true, idleRounds=0, batchNumber=0, solUsdCache:{price:number;at:number}|null=null;
process.once("SIGTERM",()=>{active=false;});
process.once("SIGINT",()=>{active=false;});
async function getSolUsd(){
  if(solUsdCache&&Date.now()-solUsdCache.at<120000)return solUsdCache.price;
  const price=await fetchSolUsd();
  if(price!==null){solUsdCache={price,at:Date.now()};return price;}
  return null;
}
while(active){
  try{
    const tokens=await store.dueTokens(20);
    if(!tokens.length){
      idleRounds++;
      if(idleRounds%20===1)process.stderr.write("[fable] market worker idle: no due launches\n");
      await sleep(15000);continue;
    }
    idleRounds=0;
    let delay=batchIntervalMs;
    try {
      // DexScreener can lack pairs for fresh bonding-curve coins.
      let dex=await fetchDexObservations(tokens.map(x=>x.mint));
      const byMint=new Map<string,{
        mint:string;marketCapUsd:number;poolLiquidityUsd:number|null;
        poolAddress:string;observedAt:Date;source:string
      }>(dex.map(x=>[x.mint,x]));
      const missing=tokens.filter(x=>!byMint.has(x.mint));
      let curveMatched=0,curveFailure:string|null=null;
      if(missing.length && rpcUrl.startsWith("https://")){
        try{
          const solUsd=await getSolUsd();
          if(solUsd!==null){
            const curves=await fetchPumpCurveSnapshots(rpcUrl,missing.map(x=>x.mint),solUsd);
            curveMatched=curves.length;
            for(const sample of curves)byMint.set(sample.mint,{
              mint:sample.mint,marketCapUsd:sample.marketCapUsd,
              poolLiquidityUsd:null,poolAddress:sample.bondingCurve,
              observedAt:sample.observedAt,source:sample.source
            });
          }else{curveFailure="missing_fresh_sol_usd";}
        }catch(error){curveFailure=error instanceof Error?error.message:"unknown_curve_error";}
      }
      let crossingCount=0;
      for(const token of tokens){
        const sample=byMint.get(token.mint);
        if(!sample){await store.deferToken(token.mint,600);continue;}
        const event=await store.recordPrice(sample);
        if(event)crossingCount++;
        if(event)process.stdout.write(JSON.stringify({
          event,mint:token.mint,symbol:token.symbol,
          marketCapUsd:sample.marketCapUsd,poolLiquidityUsd:sample.poolLiquidityUsd,
          poolAddress:sample.poolAddress,observedAt:sample.observedAt.toISOString(),
          crossingType:event==="crossed_up"?"observed_between_samples":"first_seen_above",
          optionsAvailable:false,source:sample.source,settlementOracle:false
        })+"\n");
      }
      // At most one extra three-call RPC audit every six batches (~3 min).
      // No higher-rate provider, no scans of arbitrary wallets or funding graphs.
      batchNumber++;
      if(batchNumber%6===0 && rpcUrl.startsWith("https://")){
        let ownershipCandidate:{mint:string;symbol:string}|null=null;
        try{
          ownershipCandidate=await store.dueOwnershipAudit();
          if(ownershipCandidate){
            const audit=await fetchOwnershipAudit(rpcUrl,ownershipCandidate.mint);
            await store.recordOwnershipAudit(audit);
            process.stderr.write("[fable] ownership snapshot "+JSON.stringify({
              mint:ownershipCandidate.mint,slot:audit.contextSlot,
              topTokenAccountPct:audit.topTokenAccountPct,
              topTenTokenAccountsPct:audit.topTenTokenAccountsPct,
              riskSignals:audit.riskSignals,
              beneficialOwnersVerified:false,bundleProven:false
            })+"\\n");
          }
        }catch(error){
          // A failed RPC check cannot mark ownership safe or unlocked.
          const reason=error instanceof Error?error.message:"unknown";
          if(ownershipCandidate){
            try{await store.recordOwnershipFailure(ownershipCandidate.mint,reason);}
            catch(failure){process.stderr.write("[fable] audit cooldown write failed: "+String(failure)+"\\n");}
          }
          process.stderr.write("[fable] ownership audit unavailable: "+reason+"\\n");
        }
      }
      // One historical block read per ~40 batches, only for tokens already
      // above threshold. Blocks can be large and RPC may reject old slots.
      if(batchNumber%40===0 && rpcUrl.startsWith("https://")){
        const candidate=await store.dueLaunchSlotAudit();
        if(candidate) {
          try {
            const report=await fetchLaunchSlot(
              rpcUrl,candidate.mint,candidate.slot,candidate.signature
            );
            await store.recordLaunchSlotAudit(report);
            process.stderr.write("[fable] launch slot signal "+JSON.stringify({
              mint:candidate.mint,slot:report.slot,
              positiveBalanceTransactions:report.transactionCountWithPositiveBalanceDelta,
              distinctReportedOwners:report.distinctReportedOwners,
              possibleCoordination:report.possibleCoordination,
              bundlesProven:false,fraudProven:false
            })+"\\n");
          }catch(error){
            const reason=error instanceof Error?error.message:"unknown";
            await store.recordLaunchSlotFailure(candidate.mint,candidate.slot,reason);
            process.stderr.write("[fable] historical launch slot unavailable: "+reason+"\\n");
          }
        }
      }
      process.stderr.write("[fable] market batch "+JSON.stringify({
        queried:tokens.length,dexMatched:dex.length,curveMatched,
        priced:byMint.size,unpriced:tokens.length-byMint.size,
        observedCrossings:crossingCount,curveFailure,
        settlementOracle:false
      })+"\n");
    }catch(error){
      const limited=error instanceof MarketRateLimitError;
      delay=limited?error.delayMs:Math.max(batchIntervalMs,60000);
      for(const token of tokens)await store.deferToken(token.mint,Math.ceil(delay/1000));
      process.stderr.write("[fable] market batch failed: "+String(error)+"\n");
    }
    await sleep(delay);
  }catch(error){
    process.stderr.write("[fable] worker error: "+String(error)+"\n");
    await sleep(30000);
  }
}
await store.close();
