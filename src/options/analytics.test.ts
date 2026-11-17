import test from "node:test";
import assert from "node:assert/strict";
import { analyzeOption,payoffAtExpiry,validatePayoffInput } from "./analytics.js";
const call={side:"call" as const,spotPriceUsd:1,strikePriceUsd:1,premiumUsd:10,units:100,payoutCapUsd:50};
test("capped option payoff remains bounded",()=> {
 const a=analyzeOption(call);
 assert.equal(a.maximumBuyerLossUsd,10);
 assert.equal(a.maximumBuyerNetProfitUsd,40);
 assert.ok(Math.abs((a.breakevenPriceUsd??0)-1.1)<1e-9);
 assert.equal(payoffAtExpiry(call,1000).netProfitUsd,40);
 assert.equal(payoffAtExpiry(call,0).netProfitUsd,-10);
});
test("put declines and cannot profit above payout cap",()=>{
 const x={...call,side:"put" as const};
 assert.equal(payoffAtExpiry(x,0).grossPayoutUsd,50);
 assert.equal(payoffAtExpiry(x,2).grossPayoutUsd,0);
 assert.ok(Math.abs((analyzeOption(x).breakevenPriceUsd??0)-.9)<1e-9);
});
test("rejects invalid or deceptive input values",()=>{
 assert.ok(validatePayoffInput({...call,premiumUsd:-10}).length);
 assert.throws(()=>payoffAtExpiry(call,Number.NaN));
});
