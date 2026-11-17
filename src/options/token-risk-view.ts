import {assessTokenRisk, type RiskInput} from "./token-risk.js";
/**
 * DB observations are not an independent audit of wallets/bundles.
 * Keep all unobserved safety signals unknown. Never infer "no bundles" from
 * a good price or from a blank wallet list.
 */
export interface TrackedRiskRow {
  mint:string;
  first_seen?:string|Date|null;
  last_price_at?:string|Date|null;
  latest_market_cap_usd?:number|null;
  latest_liquidity_usd?:number|null;
  latest_price_source?:string|null;
  latest_anomaly_at?:string|Date|null;
}
function timestamp(value:string|Date|null|undefined):string|null {
  if(value instanceof Date)return Number.isFinite(value.getTime())?value.toISOString():null;
  return typeof value==="string"?value:null;
}
export function assessTrackedToken(row:TrackedRiskRow,now=new Date()) {
  const input:RiskInput={
    mint:row.mint,
    observedMarketCapUsd:row.latest_market_cap_usd??null,
    observedAt:timestamp(row.last_price_at),
    liquidityUsd:row.latest_liquidity_usd??null,
    tokenCreatedAt:null, // ingestion time is NOT verified token creation time
    dataSource:row.latest_price_source??null,
    topHolderConcentrationPct:null,
    topTenConcentrationPct:null,
    holderAccountsClassified:false,
    launchBundleEvidence:"unknown",
    suspiciousVolumeEvidence:"unknown",
    mintAuthorityRevoked:null,
    freezeAuthorityRevoked:null,
    independentPriceCheck:false,
    recentAnomalyAt:timestamp(row.latest_anomaly_at)
  };
  return {
    ...assessTokenRisk(input,now),
    dataLimitations:[
      "Token first_seen is the ingestion timestamp, not verified onchain creation time.",
      "Holder classification, creator-linked wallets, bundles and volume integrity have not been independently established.",
      "This data is never a trading authorization."
    ]
  };
}
