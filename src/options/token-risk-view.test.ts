import test from "node:test";
import assert from "node:assert/strict";
import {assessTrackedToken} from "./token-risk-view.js";
const mint="31qACV9dPCTbcRky4mv4WRnFFMKy2infA41KHDoTpump";
test("newly observed $500k token cannot bypass unverified bundle and holder checks",()=>{
 const now=new Date("2026-11-17T18:00:00Z");
 const result=assessTrackedToken({
  mint,first_seen:"2026-11-17T13:00:00Z",
  last_price_at:"2026-11-17T17:59:00Z",
  latest_market_cap_usd:500000,
  latest_liquidity_usd:80000,latest_price_source:"dexscreener"
 },now);
 assert.equal(result.status,"manual_review");
 assert.equal(result.optionListingAllowed,false);
 assert.equal(result.executionAllowed,false);
 assert.ok(result.reasons.includes("LAUNCH_BUNDLE_NOT_ASSESSED"));
 assert.ok(result.reasons.includes("OWNERSHIP_CONCENTRATION_UNVERIFIED"));
 assert.ok(result.reasons.includes("TOKEN_AGE_UNVERIFIED"));
});
test("a bonding curve estimate with unknown cash liquidity is not options eligible",()=>{
 const result=assessTrackedToken({
  mint,last_price_at:"2026-11-17T17:59:00Z",
  latest_market_cap_usd:900000,
  latest_liquidity_usd:null,latest_price_source:"pump_bonding_curve_solana"
 },new Date("2026-11-17T18:00:00Z"));
 assert.equal(result.optionListingAllowed,false);
 assert.ok(result.reasons.includes("LIQUIDITY_NOT_VERIFIED"));
});
test("under-threshold or stale coins are blocked",()=>{
 const result=assessTrackedToken({
  mint,last_price_at:"2026-11-17T17:00:00Z",
  latest_market_cap_usd:150000,latest_liquidity_usd:9000
 },new Date("2026-11-17T18:00:00Z"));
 assert.equal(result.status,"blocked");
 assert.ok(result.reasons.includes("STALE_OR_INVALID_PRICE_SAMPLE"));
});
