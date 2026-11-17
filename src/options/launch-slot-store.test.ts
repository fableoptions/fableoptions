import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { FableStore } from "../storage.js";
import type { SlotAcquisitionSignal } from "./launch-slot-analysis.js";
import { assessTrackedToken } from "./token-risk-view.js";

test("preserves review-only slot acquisition signals and stores failures separately", {timeout:25000},async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires isolated Postgres");return;}
 const store=new FableStore(process.env.DATABASE_URL);await store.init();
 const mint="slot-audit-"+randomUUID(),now=new Date();
 try{
  await store.recordLaunch({mint,signature:"sig-"+randomUUID(),slot:12345,
   name:"Test",symbol:"SL",uri:"https://example.invalid",instruction:"create_v2"});
  await store.recordPrice({mint,marketCapUsd:370000,poolLiquidityUsd:36000,
   poolAddress:"pool",observedAt:now,source:"dexscreener"});
  const signal:SlotAcquisitionSignal={
   mint,slot:12345,transactionsExamined:20,
   transactionCountWithPositiveBalanceDelta:6,distinctReportedOwners:4,
   ownersWithMultiplePositiveDeltaTransactions:2,
   aggregatePositiveAtomic:"6000",participantCoverage:"observed_balance_changes",
   possibleCoordination:"needs_review",fraudProven:false,bundlesProven:false,
   limitations:["only one slot"]
  };
  await store.recordLaunchSlotAudit(signal);
  const row=await store.tokenRiskRow(mint);
  assert.equal(row.slot_analysis_status,"partial");
  assert.equal(row.slot_possible_coordination,"needs_review");
  const risk=assessTrackedToken(row,now);
  assert.ok(risk.reasons.includes("POSSIBLE_COORDINATED_LAUNCH"));
  assert.equal(risk.launchSlotEvidence.bundleProven,false);
  await assert.rejects(store.recordLaunchSlotAudit({...signal,bundlesProven:true}
   as unknown as SlotAcquisitionSignal));
  // A later failed RPC must not destroy valid partial evidence.
  await store.recordLaunchSlotFailure(mint,12345,"RPC unavailable");
  assert.equal((await store.tokenRiskRow(mint)).slot_analysis_status,"partial");
 }finally{await store.close();}
});
test("persist failed slot audit for bounded retry", {timeout:25000},async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires isolated Postgres");return;}
 const store=new FableStore(process.env.DATABASE_URL);await store.init();
 const mint="slot-fail-"+randomUUID();
 try{
  await store.recordLaunch({mint,signature:"sig-"+randomUUID(),slot:54,
   name:"Failed audit",symbol:"FA",uri:"https://example.invalid",instruction:"create_v2"});
  await store.recordLaunchSlotFailure(mint,54,"RPC 429");
  const row=await store.tokenRiskRow(mint);
  assert.equal(row.slot_analysis_status,"unavailable");
  assert.equal(row.slot_possible_coordination,null);
 }finally{await store.close();}
});
