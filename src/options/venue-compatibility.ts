/**
 * Conservative compatibility gate for an arbitrary-mint Fable option.
 * These facts MUST be externally verified for a specific venue/program,
 * not inferred from marketing or the existence of an SDK.
 * Research only: never used to unlock execution.
 */
export interface FableVenueFacts{
  programIdVerifiedOnMainnet:boolean;
  auditedDeployedBinaryMatched:boolean;
  underlyingMintPermissionless:boolean;
  supportsArbitraryFreshPumpMint:boolean;
  supportsEuropeanCashSettlement:boolean;
  supportsCappedPayout:boolean;
  hasVerifiedTokenUnitPriceOracle:boolean;
  hasVerifiedFullyFundedPayoutEscrow:boolean;
  permitsRequiredJurisdictions:boolean;
  hasExecutableCounterpartyLiquidity:boolean;
}
export type CompatibilityReport={
  compatibleOnEvidence:boolean;
  executable:false;
  blockers:string[];
};
export function evaluateFableVenue(f:FableVenueFacts):CompatibilityReport{
 const checks:ReadonlyArray<[keyof FableVenueFacts,string]>=[
  ["programIdVerifiedOnMainnet","MAINNET_PROGRAM_UNVERIFIED"],
  ["auditedDeployedBinaryMatched","DEPLOYED_BINARY_AUDIT_NOT_MATCHED"],
  ["underlyingMintPermissionless","PERMISSIONLESS_MINT_LISTING_UNVERIFIED"],
  ["supportsArbitraryFreshPumpMint","NEW_PUMP_MINT_SUPPORT_UNVERIFIED"],
  ["supportsEuropeanCashSettlement","EUROPEAN_CASH_SETTLEMENT_UNVERIFIED"],
  ["supportsCappedPayout","CAPPED_PAYOFF_SUPPORT_UNVERIFIED"],
  ["hasVerifiedTokenUnitPriceOracle","MANIPULATION_RESISTANT_ORACLE_UNVERIFIED"],
  ["hasVerifiedFullyFundedPayoutEscrow","FUNDED_ESCROW_UNVERIFIED"],
  ["permitsRequiredJurisdictions","LEGAL_CLEARANCE_UNVERIFIED"],
  ["hasExecutableCounterpartyLiquidity","EXECUTABLE_LIQUIDITY_UNVERIFIED"]
 ];
 const blockers=checks.filter(([key])=>f[key]!==true).map(([,code])=>code);
 return {compatibleOnEvidence:blockers.length===0,executable:false,blockers};
}
export const UNVERIFIED_VENUE_FACTS:Readonly<FableVenueFacts>=Object.freeze({
 programIdVerifiedOnMainnet:false,auditedDeployedBinaryMatched:false,
 underlyingMintPermissionless:false,supportsArbitraryFreshPumpMint:false,
 supportsEuropeanCashSettlement:false,supportsCappedPayout:false,
 hasVerifiedTokenUnitPriceOracle:false,
 hasVerifiedFullyFundedPayoutEscrow:false,
 permitsRequiredJurisdictions:false,
 hasExecutableCounterpartyLiquidity:false
});
