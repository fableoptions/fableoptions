/**
 * Off-chain RFQ models for simulation and future settlement integrations.
 * An acceptable quote is not proof of collateral, an executed trade or legal eligibility.
 */
export type Direction = "call" | "put";
export interface RfqRequest {
  id: string;
  buyerWallet: string;
  underlyingMint: string;
  side: Direction;
  strikePriceUsd: number;
  expiresAt: string;
  notionalUnits: number;
  maximumPremiumUsd: number;
  createdAt: string;
  requestExpiresAt: string;
}
export interface WriterQuote {
  id: string;
  rfqId: string;
  writerWallet: string;
  premiumUsd: number;
  payoutCapUsd: number;
  collateralUsd: number;
  quotedAt: string;
  validUntil: string;
  status: "indicative";
}
export type QuoteEvaluation = { acceptable: boolean; reasons: string[] };
const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const positive = (n: number) => Number.isFinite(n) && n > 0;

export function validateRfq(req: RfqRequest, now = new Date()): string[] {
  const errors: string[] = [];
  if (!req.id || req.id.length > 80) errors.push("INVALID_ID");
  if (!WALLET_RE.test(req.buyerWallet) || !WALLET_RE.test(req.underlyingMint)) errors.push("INVALID_WALLET_OR_MINT");
  if (req.side !== "call" && req.side !== "put") errors.push("INVALID_SIDE");
  if (![req.strikePriceUsd, req.notionalUnits, req.maximumPremiumUsd].every(positive)) errors.push("INVALID_SIZE");
  const created = Date.parse(req.createdAt), expiry = Date.parse(req.expiresAt), requestUntil = Date.parse(req.requestExpiresAt);
  if (![created, expiry, requestUntil].every(Number.isFinite) || created > now.getTime() ||
      expiry <= now.getTime() || requestUntil <= now.getTime() || requestUntil >= expiry)
    errors.push("INVALID_EXPIRATION");
  return errors;
}

/** A capped contract can have a finite maximum gross payout. */
export function payoutAtExpiry(side: Direction, strike: number, terminalPrice: number, units: number, capUsd: number): number {
  if (side !== "call" && side !== "put") throw new Error("Invalid option side");
  if (![strike,terminalPrice,units,capUsd].every(Number.isFinite) ||
      strike < 0 || terminalPrice < 0 || !positive(units) || !positive(capUsd))
    throw new Error("Invalid payoff inputs");
  const intrinsic = side === "call" ? Math.max(terminalPrice - strike, 0) : Math.max(strike - terminalPrice, 0);
  return Math.min(intrinsic * units, capUsd);
}

/** Checks structural consistency only — NOT funding, signature, oracle, or executable liquidity. */
export function evaluateIndicativeQuote(req: RfqRequest, quote: WriterQuote, now = new Date()): QuoteEvaluation {
  const reasons = validateRfq(req, now);
  if (!quote.id || !quote.rfqId || quote.rfqId !== req.id) reasons.push("INVALID_RFQ_REFERENCE");
  if (!WALLET_RE.test(quote.writerWallet) || quote.writerWallet === req.buyerWallet) reasons.push("INVALID_WRITER");
  if (![quote.premiumUsd, quote.payoutCapUsd, quote.collateralUsd].every(positive) ||
      quote.premiumUsd > req.maximumPremiumUsd || quote.collateralUsd < quote.payoutCapUsd)
    reasons.push("INSUFFICIENT_QUOTE_OR_COLLATERAL");
  const quoted = Date.parse(quote.quotedAt), until = Date.parse(quote.validUntil);
  if (!Number.isFinite(quoted) || !Number.isFinite(until) || quoted > now.getTime() ||
      until <= now.getTime() || until > Date.parse(req.requestExpiresAt) ||
      until > Date.parse(req.expiresAt)) reasons.push("QUOTE_EXPIRED");
  if (quote.status !== "indicative") reasons.push("UNSUPPORTED_QUOTE_STATUS");
  return { acceptable: reasons.length === 0, reasons };
}

/** Groups only identical underlying, direction, strike, and expiration. No fills occur. */
export function groupCompatibleRequests(requests: RfqRequest[], now = new Date()) {
  const groups = new Map<string, { key: string; requests: RfqRequest[]; totalUnits: number }>();
  for (const req of requests) {
    if (validateRfq(req, now).length) continue;
    const key = JSON.stringify([req.underlyingMint,req.side,req.strikePriceUsd,req.expiresAt]);
    const group = groups.get(key) ?? {key,requests:[],totalUnits:0};
    group.requests.push(req);
    group.totalUnits += req.notionalUnits;
    groups.set(key,group);
  }
  return [...groups.values()];
}
