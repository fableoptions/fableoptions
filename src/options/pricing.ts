/**
 * Educational European option-spread valuation under a lognormal assumption.
 * NOT a live market quote, bid, ask, oracle, volatility estimate, or offer to trade.
 * The user explicitly supplies annualized volatility. Extreme memecoins commonly
 * violate Black-Scholes assumptions, so prices are illustrative only.
 */
export interface ModelInput {
  side: "call" | "put";
  spotPriceUsd: number;
  strikePriceUsd: number;
  units: number;
  grossPayoutCapUsd: number;
  expirationSeconds: number;
  assumedAnnualVolatility: number;
  assumedAnnualRiskFreeRate?: number;
}
function positive(n: number) { return Number.isFinite(n) && n > 0; }
export function validateModelInput(x: ModelInput): string[] {
  const bad: string[] = [];
  if (x.side !== "call" && x.side !== "put") bad.push("invalid_side");
  if (![x.spotPriceUsd,x.strikePriceUsd,x.units,x.grossPayoutCapUsd,x.expirationSeconds,x.assumedAnnualVolatility].every(positive)) bad.push("invalid_positive_number");
  const r = x.assumedAnnualRiskFreeRate ?? 0;
  if (!Number.isFinite(r) || r < -0.1 || r > 0.25) bad.push("invalid_risk_free_rate");
  if (x.assumedAnnualVolatility > 10 || x.expirationSeconds < 60 || x.expirationSeconds > 365*86400 ||
      x.grossPayoutCapUsd > 1e9 || x.units > 1e15) bad.push("out_of_range");
  return bad;
}
// Abramowitz-Stegun approximation; bounded at infinity by the normal CDF.
function normalCdf(x: number) {
  const a = Math.abs(x);
  const t = 1/(1+0.2316419*a);
  const pdf = Math.exp(-0.5*a*a)/Math.sqrt(2*Math.PI);
  const c = 1 - pdf*(0.319381530*t -0.356563782*t*t+1.781477937*t**3-1.821255978*t**4+1.330274429*t**5);
  return x < 0 ? 1-c : c;
}
function vanilla(side:"call"|"put", s:number, k:number,t:number,v:number,r:number) {
  if (k===0) return side==="call" ? s : 0;
  const d1=(Math.log(s/k)+(r+v*v/2)*t)/(v*Math.sqrt(t));
  const d2=d1-v*Math.sqrt(t);
  const disc=Math.exp(-r*t);
  return side==="call" ? s*normalCdf(d1)-k*disc*normalCdf(d2) :
    k*disc*normalCdf(-d2)-s*normalCdf(-d1);
}
export function theoreticalCappedOption(x: ModelInput) {
  const errors=validateModelInput(x);
  if(errors.length) throw new Error(errors.join(","));
  const t=x.expirationSeconds/(365*24*3600), v=x.assumedAnnualVolatility, r=x.assumedAnnualRiskFreeRate??0;
  const lowerOrUpper=x.grossPayoutCapUsd/x.units;
  const secondStrike = x.side==="call" ? x.strikePriceUsd+lowerOrUpper : Math.max(0,x.strikePriceUsd-lowerOrUpper);
  const first=vanilla(x.side,x.spotPriceUsd,x.strikePriceUsd,t,v,r);
  const second=vanilla(x.side,x.spotPriceUsd,secondStrike,t,v,r);
  const spread = x.side==="call" ? first-second : first-second;
  // The actual cap is lower if a put strike is smaller than cap per unit.
  const attainableMax=x.side==="put" ? Math.min(x.grossPayoutCapUsd,x.strikePriceUsd*x.units) : x.grossPayoutCapUsd;
  const undiscBound=attainableMax*Math.exp(-r*t);
  const premium=Math.min(undiscBound,Math.max(0,spread*x.units));
  return {
    type:"illustrative_black_scholes_capped_spread",
    isExecutable:false,
    isMarketQuote:false,
    premiumUsd:premium,
    assumedVolatilityAnnualized:v,
    assumedRiskFreeRateAnnualized:r,
    expirationSeconds:x.expirationSeconds,
    effectiveMaximumPayoutUsd:attainableMax,
    shortStrikePriceUsd:secondStrike,
    notes:"An illustrative European capped-spread model based on user-supplied volatility. NOT observed memecoin implied volatility, executable liquidity, bid/ask, or a recommended premium. No early exercise; assumes continuous prices and lognormal returns."
  };
}
