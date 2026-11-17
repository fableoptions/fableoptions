import test from "node:test";
import assert from "node:assert/strict";
import { evaluateIndicativeQuote, groupCompatibleRequests, payoutAtExpiry, type RfqRequest, type WriterQuote } from "./rfq.js";
const buyer = "So11111111111111111111111111111111111111112";
const writer = "11111111111111111111111111111111";
const now = new Date("2026-11-17T14:00:00.000Z");
const req: RfqRequest = {
  id: "request1", buyerWallet: buyer, underlyingMint: buyer, side: "call",
  strikePriceUsd: 1, notionalUnits: 100, maximumPremiumUsd: 20,
  createdAt: "2026-11-17T13:59:00.000Z",
  requestExpiresAt: "2026-11-17T14:05:00.000Z",
  expiresAt: "2026-11-17T15:00:00.000Z"
};
const quote: WriterQuote = {
  id: "quote1", rfqId: "request1", writerWallet: writer, premiumUsd: 15,
  payoutCapUsd: 60, collateralUsd: 60,
  quotedAt: "2026-11-17T13:59:30.000Z", validUntil: "2026-11-17T14:01:00.000Z",
  status: "indicative"
};
test("capped calls and puts never exceed cap",()=>{
  assert.equal(payoutAtExpiry("call",1,3,100,60),60);
  assert.equal(payoutAtExpiry("call",1,0.8,100,60),0);
  assert.equal(payoutAtExpiry("put",1,0,100,60),60);
});
test("indicative quote checks funding amount but not actual locked funds",()=>{
  assert.equal(evaluateIndicativeQuote(req,quote,now).acceptable,true);
  assert.equal(evaluateIndicativeQuote(req,{...quote,collateralUsd:59},now).acceptable,false);
  assert.equal(evaluateIndicativeQuote(req,{...quote,validUntil:"2026-11-17T13:59:00.000Z"},now).acceptable,false);
});
test("grouping requires identical contract terms",()=>{
  const groups=groupCompatibleRequests([req,{...req,id:"request2",notionalUnits:25,maximumPremiumUsd:5},{...req,id:"request3",side:"put"}],now);
  assert.equal(groups.length,2);
  assert.equal(groups[0].totalUnits,125);
});
