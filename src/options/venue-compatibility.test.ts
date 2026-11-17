import test from "node:test";
import assert from "node:assert/strict";
import {evaluateFableVenue,UNVERIFIED_VENUE_FACTS} from "./venue-compatibility.js";
test("unverified permissionless options markets cannot be called executable",()=>{
 const x=evaluateFableVenue(UNVERIFIED_VENUE_FACTS);
 assert.equal(x.compatibleOnEvidence,false);
 assert.equal(x.executable,false);
 assert.equal(x.blockers.length,10);
});
test("American-style physical contracts are not equivalent to Fable European cash options",()=>{
 const x=evaluateFableVenue({...UNVERIFIED_VENUE_FACTS,
  programIdVerifiedOnMainnet:true,auditedDeployedBinaryMatched:true,
  underlyingMintPermissionless:true,supportsArbitraryFreshPumpMint:true,
  supportsEuropeanCashSettlement:false,supportsCappedPayout:false});
 assert.ok(x.blockers.includes("EUROPEAN_CASH_SETTLEMENT_UNVERIFIED"));
 assert.ok(x.blockers.includes("CAPPED_PAYOFF_SUPPORT_UNVERIFIED"));
 assert.equal(x.executable,false);
});
test("claims that every prerequisite is met still cannot toggle trading",()=>{
 const claimed=Object.fromEntries(Object.keys(UNVERIFIED_VENUE_FACTS).map(k=>[k,true])) as unknown as
  Parameters<typeof evaluateFableVenue>[0];
 const x=evaluateFableVenue(claimed);
 assert.equal(x.compatibleOnEvidence,true);
 assert.equal(x.executable,false);
});
