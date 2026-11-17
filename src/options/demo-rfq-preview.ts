/**
 * Test-only bridge: RFQ economics + memecoin risk screen.
 * No Solana signer, token transfer, wallet connection, executable quote or live
 * settlement is exposed. Risk screening NEVER authorizes real trading.
 */
import { assessTokenRisk, type RiskInput, type RiskAssessment } from "./token-risk.js";
import { evaluateIndicativeQuote, payoutAtExpiry, type RfqRequest, type WriterQuote } from "./rfq.js";

export type DemoRfqPreview = {
  mode: "hypothetical-fake-usdc";
  executionAllowed: false;
  depositAddress: null;
  realAssetsTransferred: false;
  status: "preview" | "blocked";
  risk: RiskAssessment;
  quoteAcceptable: boolean;
  reasons: string[];
  assumptions: { expiryPriceUsd: number; mockPriceOnly: true };
  economics: null | {
    premiumFakeUsdc: number;
    maximumPayoutFakeUsdc: number;
    payoutFakeUsdc: number;
    buyerNetFakeUsdc: number;
    writerGrossResidualFakeUsdc: number;
  };
};

/** The supplied expiry price is hypothetical, never a price-oracle observation. */
export function buildDemoRfqPreview(args: {
  request: RfqRequest;
  quote: WriterQuote;
  risk: RiskInput;
  hypotheticalExpiryPriceUsd: number;
  now?: Date;
}): DemoRfqPreview {
  const now=args.now??new Date();
  const risk=assessTokenRisk(args.risk,now);
  const evaluation=evaluateIndicativeQuote(args.request,args.quote,now);
  const reasons=[...risk.reasons,...evaluation.reasons];
  if(args.request.underlyingMint!==args.risk.mint)
    reasons.push("RFQ_RISK_MINT_MISMATCH");
  const terminal=args.hypotheticalExpiryPriceUsd;
  if(!Number.isFinite(terminal)||terminal<0)
    reasons.push("INVALID_HYPOTHETICAL_EXPIRY_PRICE");
  // This preview does not infer a cleared launch-bundle review from missing data.
  // Even an empty reasons array would NOT imply trading authorization.
  const economicPreviewAllowed=evaluation.acceptable &&
    args.request.underlyingMint===args.risk.mint &&
    Number.isFinite(terminal)&&terminal>=0;
  let economics:DemoRfqPreview["economics"]=null;
  if(economicPreviewAllowed){
    const payout=payoutAtExpiry(args.request.side,args.request.strikePriceUsd,
      terminal,args.request.notionalUnits,args.quote.payoutCapUsd);
    economics={
      premiumFakeUsdc:args.quote.premiumUsd,
      maximumPayoutFakeUsdc:args.quote.payoutCapUsd,
      payoutFakeUsdc:payout,
      buyerNetFakeUsdc:payout-args.quote.premiumUsd,
      writerGrossResidualFakeUsdc:args.quote.payoutCapUsd+args.quote.premiumUsd-payout
    };
  }
  return {
    mode:"hypothetical-fake-usdc",
    executionAllowed:false,
    depositAddress:null,
    realAssetsTransferred:false,
    status:economicPreviewAllowed?"preview":"blocked",
    risk,quoteAcceptable:evaluation.acceptable,
    reasons:[...new Set(reasons)],
    assumptions:{expiryPriceUsd:terminal,mockPriceOnly:true},
    economics
  };
}
