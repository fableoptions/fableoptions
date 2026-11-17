/**
 * Heuristic risk signal, not proof of fraud.
 * Compare consecutive observations only if source continuity and time freshness hold.
 */
export type MarketJump = { anomalous:boolean; ratio:number|null; reason:"rapid_jump"|"rapid_collapse"|null };
export function assessMarketJump(
 previousUsd:number|null,currentUsd:number,
 elapsedSeconds:number|null,sameSource:boolean
):MarketJump{
  if(previousUsd===null||!Number.isFinite(previousUsd)||previousUsd<=0||
     !Number.isFinite(currentUsd)||currentUsd<=0||
     elapsedSeconds===null||!Number.isFinite(elapsedSeconds)||
     elapsedSeconds<0||elapsedSeconds>300||!sameSource)
    return {anomalous:false,ratio:null,reason:null};
  const ratio=currentUsd/previousUsd;
  if(ratio>=3)return {anomalous:true,ratio,reason:"rapid_jump"};
  if(ratio<=1/3)return {anomalous:true,ratio,reason:"rapid_collapse"};
  return {anomalous:false,ratio,reason:null};
}
