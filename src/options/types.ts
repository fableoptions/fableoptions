/** Fable options integration boundary. No real-money provider is configured. */
export type OptionSide = "call" | "put";
export type QuoteStatus = "firm" | "indicative";
export type OptionsVenue = "poc-tender" | "epicentral-opx" | "opta" | "skew";
export interface OptionQuote {
  venue: OptionsVenue;
  underlyingMint: string;
  quoteId: string;
  side: OptionSide;
  strikePriceUsd: number;
  expiresAt: string;
  premiumUsd: number;
  maximumLossUsd: number;
  availableSize: number;
  status: QuoteStatus;
  observedAt: string;
  validUntil: string;
  mainnetProgramId: string;
  settlementMethod: "cash" | "physical";
}
export interface UnderlyingEligibility {
  mint: string;
  marketCapUsd: number | null;
  poolLiquidityUsd: number | null;
  verifiedPumpFunOrigin: boolean;
  priceObservedAt: string | null;
  optionsMarketVerified: boolean;
}
export interface VenueVerification {
  venue: OptionsVenue;
  mainnetDeploymentIndependentlyVerified: boolean;
  externalAuditVerified: boolean;
  collateralAndSettlementVerified: boolean;
  executableLiquidityVerified: boolean;
  integrationPermissionVerified: boolean;
}
export interface ClientEligibility {
  /** Verified by a compliant screening service; never infer permission from IP alone. */
  jurisdictionAllowed: boolean;
  sanctionsScreenClear: boolean;
  kycCompletedIfRequired: boolean;
  eligibilityCheckedAt: string | null;
}
export interface TradeAuthorization { allowed: boolean; reasons: string[] }
