/**
 * Fable options payoff analytics.
 * This calculates contractual expiration payoffs only. No option valuation,
 * real quote, implied volatility estimate, liquidity, or execution is offered.
 */
export type OptionKind = "call" | "put";
export interface PayoffInput {
  side: OptionKind;
  spotPriceUsd: number;
  strikePriceUsd: number;
  premiumUsd: number;
  units: number;
  payoutCapUsd: number;
}
export interface PayoffPoint {
  underlyingChangePct: number;
  terminalPriceUsd: number;
  grossPayoutUsd: number;
  netProfitUsd: number;
  returnOnPremiumPct: number;
}
const finite = (n: number) => Number.isFinite(n);
export function validatePayoffInput(x: PayoffInput): string[] {
  const errors: string[] = [];
  if (x.side !== "call" && x.side !== "put") errors.push("invalid_side");
  if (![x.spotPriceUsd,x.strikePriceUsd,x.premiumUsd,x.units,x.payoutCapUsd].every(finite)) errors.push("nonfinite_number");
  if (!(x.spotPriceUsd > 0) || !(x.strikePriceUsd > 0) || !(x.premiumUsd > 0) ||
      !(x.units > 0) || !(x.payoutCapUsd > 0)) errors.push("numbers_must_be_positive");
  if (x.premiumUsd > 1_000_000 || x.units > 1e18 || x.payoutCapUsd > 1_000_000_000) errors.push("out_of_range");
  return errors;
}
export function payoffAtExpiry(x: PayoffInput, terminalPriceUsd: number): PayoffPoint {
  if (validatePayoffInput(x).length || !finite(terminalPriceUsd) || terminalPriceUsd < 0)
    throw new Error("Invalid payoff inputs");
  const intrinsic = x.side === "call"
    ? Math.max(terminalPriceUsd-x.strikePriceUsd,0)
    : Math.max(x.strikePriceUsd-terminalPriceUsd,0);
  const gross = Math.min(x.payoutCapUsd,intrinsic*x.units);
  const net = gross-x.premiumUsd;
  return {
    underlyingChangePct: (terminalPriceUsd/x.spotPriceUsd-1)*100,
    terminalPriceUsd,
    grossPayoutUsd: gross,
    netProfitUsd: net,
    returnOnPremiumPct: net/x.premiumUsd*100
  };
}
export function analyzeOption(x: PayoffInput) {
  if (validatePayoffInput(x).length) throw new Error("Invalid payoff inputs");
  const changes = [-90,-75,-50,-30,-15,0,15,30,50,75,100,200,400];
  const breakeven = x.side === "call" ? x.strikePriceUsd + x.premiumUsd/x.units : x.strikePriceUsd - x.premiumUsd/x.units;
  const breakevenPriceUsd = breakeven >= 0 && x.premiumUsd <= x.payoutCapUsd ? breakeven : null;
  return {
    kind: "hypothetical_expiration_payoff",
    isOptionQuote: false,
    isExecutable: false,
    assumptions: { ...x },
    maximumBuyerLossUsd: x.premiumUsd,
    maximumBuyerNetProfitUsd: x.payoutCapUsd-x.premiumUsd,
    breakevenPriceUsd,
    outcomes: changes.map(change => payoffAtExpiry(x,x.spotPriceUsd*(1+change/100))),
    explanation: "Contractual expiration payoff only. Premium is user-supplied, not a live market quote. Excludes fees, slippage, volatility, time decay, and early exit."
  };
}
