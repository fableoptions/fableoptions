/**
 * Fail-closed risk controls for memecoin OPTIONS eligibility.
 *
 * A $300K market-cap observation alone is NEVER sufficient.
 * Bundled ownership cannot be proved by the count of token accounts;
 * correlated holders, exchange wallets and AMM vaults need independent checks.
 * This module cannot authorize real-money execution.
 */
export type RiskStatus = "blocked" | "manual_review" | "passed_screen_not_tradable";
export type RiskInput = {
  mint: string;
  observedMarketCapUsd: number | null;
  observedAt: string | null;
  liquidityUsd: number | null;
  tokenCreatedAt: string | null;
  dataSource: string | null;
  topHolderConcentrationPct: number | null;
  topTenConcentrationPct: number | null;
  holderAccountsClassified: boolean;
  launchBundleEvidence: "confirmed_high_risk" | "suspected" | "no_evidence_found" | "unknown";
  suspiciousVolumeEvidence: "confirmed" | "suspected" | "none_observed" | "unknown";
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
  independentPriceCheck: boolean;
  recentAnomalyAt?: string | null;
};
export type RiskAssessment = {
  mint: string;
  status: RiskStatus;
  optionListingAllowed: false;
  executionAllowed: false;
  evidenceLevel: "incomplete" | "screen_only";
  reasons: string[];
  requirements: { minimumLiquidityUsd: number; minimumAgeMinutes: number; maximumTopHolderPct: number; maximumTopTenPct: number };
  warning: string;
};
export const RISK_LIMITS = {
  minimumMarketCapUsd:300000,
  minimumLiquidityUsd:30000,
  minimumAgeMinutes:60,
  maximumTopHolderPct:15,
  maximumTopTenPct:50,
  maximumPriceAgeSeconds:180
} as const;
export function assessTokenRisk(input:RiskInput, now=new Date()): RiskAssessment {
  const blockers:string[]=[];
  const review:string[]=[];
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.mint))blockers.push("INVALID_MINT");
  if(input.observedMarketCapUsd===null||!Number.isFinite(input.observedMarketCapUsd)||
     input.observedMarketCapUsd<RISK_LIMITS.minimumMarketCapUsd)blockers.push("MARKET_CAP_BELOW_THRESHOLD_OR_UNVERIFIED");
  if(input.liquidityUsd!==null && (!Number.isFinite(input.liquidityUsd)||input.liquidityUsd<RISK_LIMITS.minimumLiquidityUsd))
    blockers.push("INADEQUATE_MEASURED_LIQUIDITY");
  if(input.liquidityUsd===null)review.push("LIQUIDITY_NOT_VERIFIED");
  const priceAt=input.observedAt===null?NaN:Date.parse(input.observedAt);
  if(!Number.isFinite(priceAt)||priceAt>now.getTime()+30000||
     (now.getTime()-priceAt)>RISK_LIMITS.maximumPriceAgeSeconds*1000)
    blockers.push("STALE_OR_INVALID_PRICE_SAMPLE");
  const born=input.tokenCreatedAt===null?NaN:Date.parse(input.tokenCreatedAt);
  if(!Number.isFinite(born))review.push("TOKEN_AGE_UNVERIFIED");
  else if(born>now.getTime()||now.getTime()-born<RISK_LIMITS.minimumAgeMinutes*60000)
    blockers.push("TOKEN_TOO_NEW_FOR_OPTIONS_RISK_SCREEN");
  if(input.launchBundleEvidence==="confirmed_high_risk")blockers.push("HIGH_RISK_BUNDLE_EVIDENCE");
  else if(input.launchBundleEvidence==="suspected")review.push("POSSIBLE_COORDINATED_LAUNCH");
  else if(input.launchBundleEvidence==="unknown")review.push("LAUNCH_BUNDLE_NOT_ASSESSED");
  if(input.suspiciousVolumeEvidence==="confirmed")blockers.push("CONFIRMED_VOLUME_MANIPULATION_INDICATORS");
  else if(input.suspiciousVolumeEvidence==="suspected")review.push("SUSPICIOUS_VOLUME_INDICATORS");
  else if(input.suspiciousVolumeEvidence==="unknown")review.push("VOLUME_INTEGRITY_NOT_ASSESSED");
  if(input.topHolderConcentrationPct!==null){
    if(!Number.isFinite(input.topHolderConcentrationPct)||input.topHolderConcentrationPct<0||
       input.topHolderConcentrationPct>100)review.push("HOLDER_DATA_INVALID");
    else if(input.holderAccountsClassified&&input.topHolderConcentrationPct>RISK_LIMITS.maximumTopHolderPct)
      blockers.push("TOP_HOLDER_CONCENTRATION");
  }
  if(input.topTenConcentrationPct!==null){
    if(!Number.isFinite(input.topTenConcentrationPct)||input.topTenConcentrationPct<0||
       input.topTenConcentrationPct>100)review.push("HOLDER_DATA_INVALID");
    else if(input.holderAccountsClassified&&input.topTenConcentrationPct>RISK_LIMITS.maximumTopTenPct)
      blockers.push("TOP_TEN_HOLDER_CONCENTRATION");
  }
  if(!input.holderAccountsClassified||input.topHolderConcentrationPct===null||
     input.topTenConcentrationPct===null)review.push("OWNERSHIP_CONCENTRATION_UNVERIFIED");
  if(input.mintAuthorityRevoked!==true)review.push("MINT_AUTHORITY_NOT_CONFIRMED_SAFE");
  if(input.freezeAuthorityRevoked!==true)review.push("FREEZE_AUTHORITY_NOT_CONFIRMED_SAFE");
  if(input.recentAnomalyAt){
    const anomalyTime=Date.parse(input.recentAnomalyAt);
    if(Number.isFinite(anomalyTime) && anomalyTime<=now.getTime()+30000 &&
       now.getTime()-anomalyTime<=60*60*1000){
      review.push("RECENT_EXTREME_MARKET_CAP_MOVE");
    }
  }
  if(!input.independentPriceCheck)review.push("INDEPENDENT_PRICE_VALIDATION_MISSING");
  const reasons=[...new Set([...blockers,...review])];
  return {
    mint:input.mint,
    status:blockers.length?"blocked":review.length?"manual_review":"passed_screen_not_tradable",
    optionListingAllowed:false,
    executionAllowed:false,
    evidenceLevel:review.length?"incomplete":"screen_only",
    reasons,
    requirements:{
      minimumLiquidityUsd:RISK_LIMITS.minimumLiquidityUsd,
      minimumAgeMinutes:RISK_LIMITS.minimumAgeMinutes,
      maximumTopHolderPct:RISK_LIMITS.maximumTopHolderPct,
      maximumTopTenPct:RISK_LIMITS.maximumTopTenPct
    },
    warning:"A risk-screen pass is not proof a token is free from bundling, wash trading or price manipulation, and never enables option execution."
  };
}
