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
  ownership_observed_at?:string|Date|null;
  top_account_pct?:number|null;
  top_ten_account_pct?:number|null;
  distinct_visible_owners?:number|null;
  repeated_owner_accounts?:number|null;
  mint_authority_revoked?:boolean|null;
  freeze_authority_revoked?:boolean|null;
  ownership_risk_signals?:string[]|null;
  slot_analysis_status?:string|null;
  positive_delta_transactions?:number|null;
  distinct_reported_owners?:number|null;
  slot_repeated_owner_accounts?:number|null;
  slot_possible_coordination?:string|null;
  funding_status?:string|null;
  funding_scanned_wallets?:number|null;
  common_funding_source_count?:number|null;
  funding_source_recipient_counts?:number[]|null;
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
    launchBundleEvidence:row.slot_possible_coordination==="needs_review"||
      row.funding_status==="partial_with_link_signal"?"suspected":"unknown",
    suspiciousVolumeEvidence:"unknown",
    mintAuthorityRevoked:row.mint_authority_revoked??null,
    freezeAuthorityRevoked:row.freeze_authority_revoked??null,
    independentPriceCheck:false,
    recentAnomalyAt:timestamp(row.latest_anomaly_at)
  };
  const assessment=assessTokenRisk(input,now);
  const signals=Array.isArray(row.ownership_risk_signals)?row.ownership_risk_signals:[];
  const visibleConcentration=signals.some(x=>x.includes("EXCEEDS")||x.includes("SHARE_SAME"));
  return {
    ...assessment,
    reasons:[...new Set([...assessment.reasons,...(visibleConcentration?["UNCLASSIFIED_OWNERSHIP_CONCENTRATION_REVIEW"]:[])])],
    fundingEvidence:{
      status:row.funding_status??"not_checked",
      walletsSampled:row.funding_scanned_wallets??null,
      observedCommonSourceCount:row.common_funding_source_count??null,
      recipientCounts:Array.isArray(row.funding_source_recipient_counts)?row.funding_source_recipient_counts:[],
      commonControlProven:false,
      completeFundingHistory:false
    },
    launchSlotEvidence:{
      analysisStatus:row.slot_analysis_status??"not_checked",
      positiveDeltaTransactions:row.positive_delta_transactions??null,
      distinctReportedOwners:row.distinct_reported_owners??null,
      repeatedOwnerAccounts:row.slot_repeated_owner_accounts??null,
      coordinationSignal:row.slot_possible_coordination??"unknown",
      bundleProven:false,
      allLaunchTransactionsCovered:false
    },
    ownershipEvidence:{
      observedAt:timestamp(row.ownership_observed_at),
      topTokenAccountPct:row.top_account_pct??null,
      topTenTokenAccountsPct:row.top_ten_account_pct??null,
      distinctVisibleOwners:row.distinct_visible_owners??null,
      repeatedOwnerAccounts:row.repeated_owner_accounts??null,
      riskSignals:signals,
      beneficialOwnersVerified:false,bundleProven:false
    },
    dataLimitations:[
      "Token first_seen is the ingestion timestamp, not verified onchain creation time.",
      "Observed largest token-account balances are not necessarily beneficial owners; pool vaults and custodians are unclassified.",
      "Sparse common-funding observations cannot establish beneficial ownership or identify custodial exchange senders.",
      "Creator-linked wallets, all same-slot buys and volume integrity have not been independently established.",
      "This data is never a trading authorization."
    ]
  };
}
