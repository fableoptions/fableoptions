/**
 * A sampled observation is never a settlement oracle or a guarantee of coverage.
 * Freshness is based on the timestamp of the last successful market sample.
 */
export type FreshnessStatus = "fresh" | "stale" | "unpriced" | "future_timestamp";
export function marketFreshness(observedAt: string | Date | null, now = new Date(), maxAgeSeconds = 180): {
  status: FreshnessStatus; ageSeconds: number | null; eligibleForDisplay: boolean;
} {
  if (!observedAt) return {status:"unpriced",ageSeconds:null,eligibleForDisplay:false};
  const value=observedAt instanceof Date ? observedAt.getTime() : Date.parse(observedAt);
  if (!Number.isFinite(value)) return {status:"unpriced",ageSeconds:null,eligibleForDisplay:false};
  const age=(now.getTime()-value)/1000;
  if (age < -30) return {status:"future_timestamp",ageSeconds:age,eligibleForDisplay:false};
  if (age > maxAgeSeconds) return {status:"stale",ageSeconds:age,eligibleForDisplay:false};
  return {status:"fresh",ageSeconds:Math.max(0,age),eligibleForDisplay:true};
}
export function decorateMarketRow<T extends {last_price_at?:string|Date|null}>(row:T,now=new Date()) {
  return {...row,marketData:marketFreshness(row.last_price_at??null,now),marketDataSource:"sampled_geckoterminal",settlementOracle:false};
}
