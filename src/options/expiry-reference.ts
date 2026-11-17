/**
 * Conservative historic market-cap TWAP for research ONLY.
 * Market capitalization is not the underlying token's USD price and this
 * output is NOT usable for options payoff, escrow or settlement.
 */
export type CapObservation={
 observedAt:string|Date;
 marketCapUsd:number;
 liquidityUsd:number|null;
 source:string;
 poolAddress:string;
};
export type IndicativeExpiryReference={
 kind:"indicative_market_cap_twap";
 status:"insufficient_data"|"quarantined"|"sampled_reference_only";
 mint:string;
 startAt:string;
 endAt:string;
 windowSeconds:number;
 sampledMarketCapTwapUsd:number|null;
 reasonCodes:string[];
 observationCount:number;
 source:string|null;
 poolAddress:string|null;
 maxGapSeconds:number|null;
 minObservedLiquidityUsd:number|null;
 executable:false;
 validSettlementOracle:false;
 underlyingTokenPriceUsd:null;
 disclaimer:string;
};
const DISCLAIMER="Historical, indicative MARKET CAP average only, not token USD price or an options settlement oracle. Never usable to execute, determine, or pay out a derivative.";
export function assessExpiryCapWindow(
 mint:string,observations:CapObservation[],startAt:Date,endAt:Date
):IndicativeExpiryReference{
 const start=startAt.getTime(),end=endAt.getTime(),windowSeconds=(end-start)/1000;
 if(!Number.isFinite(start)||!Number.isFinite(end)||windowSeconds<600||
    windowSeconds>3600||end>Date.now()+30000)
   throw new Error("invalid_reference_window");
 const sorted=[...observations].map(o=>({...o,time:new Date(o.observedAt).getTime()}))
   .filter(o=>Number.isFinite(o.time)&&o.time>=start&&o.time<=end)
   .sort((a,b)=>a.time-b.time);
 const reasons:string[]=[];
 if(sorted.length<6)reasons.push("TOO_FEW_SAMPLES");
 let maxGap=0;
 if(sorted.length){
   maxGap=Math.max((sorted[0].time-start)/1000,(end-sorted[sorted.length-1].time)/1000);
   for(let i=1;i<sorted.length;i++)
     maxGap=Math.max(maxGap,(sorted[i].time-sorted[i-1].time)/1000);
 }
 if(!sorted.length||maxGap>120)reasons.push("STALE_OR_MISSING_INTERVALS");
 const sources=new Set(sorted.map(o=>o.source));
 const pools=new Set(sorted.map(o=>o.poolAddress));
 if(sources.size!==1||!sources.has("dexscreener"))reasons.push("UNSUPPORTED_OR_MIXED_PRICE_SOURCE");
 if(pools.size!==1||sorted.some(o=>!o.poolAddress))reasons.push("POOL_CHANGED_OR_MISSING");
 if(sorted.some(o=>!Number.isFinite(o.marketCapUsd)||o.marketCapUsd<=0))
   reasons.push("INVALID_MARKET_CAP");
 const liquidities=sorted.map(o=>o.liquidityUsd);
 if(liquidities.some(x=>x===null||!Number.isFinite(x)||x<30000))
   reasons.push("MISSING_OR_LOW_LIQUIDITY");
 for(let i=1;i<sorted.length;i++){
   const prev=sorted[i-1].marketCapUsd,cur=sorted[i].marketCapUsd;
   if(prev>0&&cur>0&&(cur/prev>2||cur/prev<0.5)){
     reasons.push("EXTREME_INTER_SAMPLE_CHANGE");
     break;
   }
 }
 let sum=0;
 if(reasons.length===0){
   // Piecewise-constant integration, with endpoint carry limited by max gap.
   let cursor=start,price=sorted[0].marketCapUsd;
   for(const row of sorted){
     sum+=price*(row.time-cursor);
     cursor=row.time;
     price=row.marketCapUsd;
   }
   sum+=price*(end-cursor);
 }
 const blocked=reasons.length>0;
 const integrityProblems=reasons.some(x=>[
   "EXTREME_INTER_SAMPLE_CHANGE","POOL_CHANGED_OR_MISSING",
   "UNSUPPORTED_OR_MIXED_PRICE_SOURCE","INVALID_MARKET_CAP","MISSING_OR_LOW_LIQUIDITY"
 ].includes(x));
 return {
   kind:"indicative_market_cap_twap",
   status:blocked?(integrityProblems?"quarantined":"insufficient_data"):"sampled_reference_only",
   mint,startAt:startAt.toISOString(),endAt:endAt.toISOString(),
   windowSeconds,sampledMarketCapTwapUsd:blocked?null:sum/(end-start),
   reasonCodes:[...new Set(reasons)],observationCount:sorted.length,
   source:sources.size===1?[...sources][0]:null,
   poolAddress:pools.size===1?[...pools][0]:null,
   maxGapSeconds:sorted.length?maxGap:null,
   minObservedLiquidityUsd:liquidities.length&&!liquidities.includes(null)
     ?Math.min(...liquidities as number[]):null,
   executable:false,validSettlementOracle:false,underlyingTokenPriceUsd:null,
   disclaimer:DISCLAIMER
 };
}
