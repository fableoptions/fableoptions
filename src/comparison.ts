/** Educational payoff comparison only. Not an options pricer or liquidation engine. */
export interface ComparisonInputs {
  entryPrice: number;
  exitPrice: number;
  strikePrice: number;
  underlyingUnits: number;
  optionPremiumUsd: number;
  marginUsd: number;
  leverage: number;
}
export interface ComparisonResult {
  callNetPnlUsd: number;
  callMaxLossUsd: number;
  callBreakevenPrice: number;
  perpNetPnlUsd: number;
  perpNotionalUsd: number;
  perpApproxInitialMarginLossPrice: number;
}
export function compareLongCallWithLongPerp(input: ComparisonInputs): ComparisonResult {
  const {entryPrice, exitPrice, strikePrice, underlyingUnits, optionPremiumUsd, marginUsd, leverage} = input;
  const values = [entryPrice, exitPrice, strikePrice, underlyingUnits, optionPremiumUsd, marginUsd, leverage];
  if (values.some(v => !Number.isFinite(v)) || entryPrice <= 0 || exitPrice < 0 || strikePrice < 0 ||
      underlyingUnits <= 0 || optionPremiumUsd <= 0 || marginUsd <= 0 || leverage < 1)
    throw new Error("Invalid comparison inputs");
  const perpNotionalUsd = marginUsd * leverage;
  return {
    callNetPnlUsd: Math.max(exitPrice - strikePrice, 0) * underlyingUnits - optionPremiumUsd,
    callMaxLossUsd: optionPremiumUsd,
    callBreakevenPrice: strikePrice + optionPremiumUsd / underlyingUnits,
    perpNetPnlUsd: perpNotionalUsd * (exitPrice / entryPrice - 1),
    perpNotionalUsd,
    // A rough reference only: actual liquidation depends on venue, maintenance margin, and fees.
    perpApproxInitialMarginLossPrice: Math.max(0, entryPrice * (1 - 1 / leverage))
  };
}
