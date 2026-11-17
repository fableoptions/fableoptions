import test from "node:test";
import assert from "node:assert/strict";
import { buildDemoRfqPreview } from "./demo-rfq-preview.js";
import type { RiskInput } from "./token-risk.js";
import type { RfqRequest, WriterQuote } from "./rfq.js";

const now=new Date("2026-11-17T14:00:00.000Z");
const mint="So11111111111111111111111111111111111111112";
const buyer="11111111111111111111111111111111";
const writer="SysvarRent111111111111111111111111111111111";
const request:RfqRequest={
  id:"rfq-1",buyerWallet:buyer,underlyingMint:mint,side:"call",
  strikePriceUsd:1,notionalUnits:100,maximumPremiumUsd:25,
  createdAt:"2026-11-17T13:59:00.000Z",
  requestExpiresAt:"2026-11-17T14:05:00.000Z",
  expiresAt:"2026-11-17T15:00:00.000Z"
};
const quote:WriterQuote={
  id:"quote-1",rfqId:request.id,writerWallet:writer,premiumUsd:20,
  payoutCapUsd:100,collateralUsd:100,status:"indicative",
  quotedAt:"2026-11-17T13:59:30.000Z",
  validUntil:"2026-11-17T14:01:00.000Z"
};
const risk:RiskInput={
  mint,observedMarketCapUsd:500000,observedAt:"2026-11-17T13:59:55.000Z",
  liquidityUsd:60000,tokenCreatedAt:null,dataSource:"test-only",
  topHolderConcentrationPct:null,topTenConcentrationPct:null,
  holderAccountsClassified:false,launchBundleEvidence:"unknown",
  suspiciousVolumeEvidence:"unknown",mintAuthorityRevoked:null,
  freezeAuthorityRevoked:null,independentPriceCheck:false
};
const preview=(overrides:Partial<Parameters<typeof buildDemoRfqPreview>[0]>={})=>
  buildDemoRfqPreview({request,quote,risk,hypotheticalExpiryPriceUsd:2,now,...overrides});

test("fake-USDC payoff preview never creates executable quote or deposit destination",()=>{
  const p=preview();
  assert.equal(p.status,"preview");
  assert.equal(p.mode,"hypothetical-fake-usdc");
  assert.equal(p.executionAllowed,false);
  assert.equal(p.depositAddress,null);
  assert.equal(p.realAssetsTransferred,false);
  assert.equal(p.risk.executionAllowed,false);
  assert.equal(p.risk.status,"manual_review");
  assert.deepEqual(p.economics,{
    premiumFakeUsdc:20,maximumPayoutFakeUsdc:100,
    payoutFakeUsdc:100,buyerNetFakeUsdc:80,writerGrossResidualFakeUsdc:20
  });
  assert.ok(p.reasons.includes("LAUNCH_BUNDLE_NOT_ASSESSED"));
});

test("mismatched scanner mint blocks economics, not just trading",()=>{
  const p=preview({risk:{...risk,mint:writer}});
  assert.equal(p.status,"blocked");
  assert.equal(p.economics,null);
  assert.ok(p.reasons.includes("RFQ_RISK_MINT_MISMATCH"));
});

test("expired or malformed RFQ quote cannot be previewed",()=>{
  for(const q of [{...quote,validUntil:"2026-11-17T13:59:59.000Z"},
                  {...quote,collateralUsd:99},
                  {...quote,writerWallet:buyer}]){
    const p=preview({quote:q});
    assert.equal(p.status,"blocked");
    assert.equal(p.economics,null);
    assert.equal(p.executionAllowed,false);
  }
});

test("invalid hypothetical expiry prices are rejected without exposing NaN payouts",()=>{
  for(const price of [-1,NaN,Infinity]){
    const p=preview({hypotheticalExpiryPriceUsd:price});
    assert.equal(p.status,"blocked");
    assert.equal(p.economics,null);
    assert.ok(p.reasons.includes("INVALID_HYPOTHETICAL_EXPIRY_PRICE"));
  }
});

test("high-risk bundle blocks listing even though numerical payoff is only a hypothetical illustration",()=>{
  const p=preview({risk:{...risk,launchBundleEvidence:"confirmed_high_risk"}});
  assert.equal(p.risk.status,"blocked");
  assert.equal(p.risk.optionListingAllowed,false);
  assert.equal(p.executionAllowed,false);
  assert.ok(p.reasons.includes("HIGH_RISK_BUNDLE_EVIDENCE"));
});
