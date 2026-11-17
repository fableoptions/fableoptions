import test from "node:test";
import assert from "node:assert/strict";
import {marketFreshness,decorateMarketRow} from "./market-freshness.js";
const now=new Date("2026-11-17T15:00:00Z");
test("fresh observations remain displayable but not oracles",()=>{
  const x=decorateMarketRow({last_price_at:"2026-11-17T14:58:00Z"},now);
  assert.equal(x.marketData.status,"fresh");
  assert.equal(x.marketData.eligibleForDisplay,true);
  assert.equal(x.settlementOracle,false);
});
test("stale, unpriced and future observations are not displayed as live",()=>{
  assert.equal(marketFreshness("2026-11-17T14:55:00Z",now).status,"stale");
  assert.equal(marketFreshness(null,now).status,"unpriced");
  assert.equal(marketFreshness("2026-11-17T15:01:00Z",now).status,"future_timestamp");
});
