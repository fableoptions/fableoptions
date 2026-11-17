import type { ClientEligibility, OptionQuote, TradeAuthorization, UnderlyingEligibility, VenueVerification } from "./types.js";

const VALID_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_QUOTE_AGE_MS = 10_000;
const MAX_ELIGIBILITY_AGE_MS = 60 * 60 * 1000;

/** Fail closed. This is an internal guard, not a substitute for legal review or audit. */
export function authorizeOptionTrade(args: {
  quote: OptionQuote | null;
  token: UnderlyingEligibility;
  venue: VenueVerification | null;
  client: ClientEligibility;
  now?: Date;
}): TradeAuthorization {
  const { quote, token, venue, client } = args;
  const now = (args.now ?? new Date()).getTime();
  const reasons: string[] = [];
  if (!VALID_MINT.test(token.mint)) reasons.push("INVALID_TOKEN_MINT");
  if (!token.verifiedPumpFunOrigin) reasons.push("UNVERIFIED_PUMPFUN_ORIGIN");
  if (token.marketCapUsd === null || !Number.isFinite(token.marketCapUsd) || token.marketCapUsd < 300_000) reasons.push("BELOW_MARKET_CAP_THRESHOLD");
  if (token.poolLiquidityUsd === null || !Number.isFinite(token.poolLiquidityUsd) || token.poolLiquidityUsd < 30_000) reasons.push("INSUFFICIENT_POOL_LIQUIDITY");
  if (!token.priceObservedAt || !Number.isFinite(Date.parse(token.priceObservedAt)) || now - Date.parse(token.priceObservedAt) > 15_000 || Date.parse(token.priceObservedAt) > now) reasons.push("STALE_UNDERLYING_PRICE");
  if (!token.optionsMarketVerified) reasons.push("UNVERIFIED_OPTIONS_MARKET");
  if (!venue || !venue.mainnetDeploymentIndependentlyVerified || !venue.externalAuditVerified ||
      !venue.collateralAndSettlementVerified || !venue.executableLiquidityVerified ||
      !venue.integrationPermissionVerified) reasons.push("VENUE_NOT_VERIFIED");
  if (!client.jurisdictionAllowed || !client.sanctionsScreenClear || !client.kycCompletedIfRequired ||
      !client.eligibilityCheckedAt || !Number.isFinite(Date.parse(client.eligibilityCheckedAt)) ||
      Date.parse(client.eligibilityCheckedAt) > now ||
      now - Date.parse(client.eligibilityCheckedAt) > MAX_ELIGIBILITY_AGE_MS) reasons.push("CLIENT_NOT_VERIFIED");

  if (!quote) reasons.push("NO_EXECUTABLE_QUOTE");
  else {
    if (quote.underlyingMint !== token.mint) reasons.push("MINT_MISMATCH");
    if (venue && quote.venue !== venue.venue) reasons.push("VENUE_MISMATCH");
    if (quote.status !== "firm") reasons.push("QUOTE_NOT_FIRM");
    if (!quote.quoteId || !quote.mainnetProgramId) reasons.push("INVALID_QUOTE_ID_OR_PROGRAM");
    if (!(quote.premiumUsd > 0) || !Number.isFinite(quote.premiumUsd) ||
        !(quote.availableSize > 0) || !Number.isFinite(quote.availableSize) ||
        !Number.isFinite(quote.strikePriceUsd) || quote.strikePriceUsd <= 0 ||
        !Number.isFinite(quote.maximumLossUsd) || quote.maximumLossUsd < quote.premiumUsd) reasons.push("INVALID_QUOTE_VALUES");
    const observed = Date.parse(quote.observedAt);
    const validUntil = Date.parse(quote.validUntil);
    const expires = Date.parse(quote.expiresAt);
    if (!Number.isFinite(observed) || observed > now || now - observed > MAX_QUOTE_AGE_MS ||
        !Number.isFinite(validUntil) || validUntil <= now || !Number.isFinite(expires) || expires <= now) reasons.push("QUOTE_EXPIRED_OR_STALE");
  }
  return { allowed: reasons.length === 0, reasons };
}
