import test from "node:test";
import assert from "node:assert/strict";
import { theoreticalCappedOption } from "./pricing.js";
const base={side:"call" as const,spotPriceUsd:1,strikePriceUsd:1,units:100,grossPayoutCapUsd:50,expirationSeconds:3600,assumedAnnualVolatility:2};
test("model prices stay within funded gross payout bound",()=>{
  for(const side of ["call","put"] as const){
    const x=theoreticalCappedOption({...base,side});
    assert.ok(x.premiumUsd>=0 && x.premiumUsd<=50);
    assert.equal(x.isExecutable,false);
    assert.equal(x.isMarketQuote,false);
  }
});
test("higher modeled volatility increases an at-the-money spread's approximate premium",()=>{
  const low=theoreticalCappedOption({...base,assumedAnnualVolatility:.5}).premiumUsd;
  const high=theoreticalCappedOption({...base,assumedAnnualVolatility:3}).premiumUsd;
  assert.ok(high>low);
});
test("put maximum payout cannot exceed strike times units",()=>{
  const p=theoreticalCappedOption({...base,side:"put",strikePriceUsd:.2,grossPayoutCapUsd:200});
  assert.equal(p.effectiveMaximumPayoutUsd,20);
  assert.ok(p.premiumUsd<=20);
});
test("rejects non-finite and excessive leverage-like model inputs",()=>{
  assert.throws(()=>theoreticalCappedOption({...base,assumedAnnualVolatility:NaN}));
  assert.throws(()=>theoreticalCappedOption({...base,assumedAnnualVolatility:100}));
});
