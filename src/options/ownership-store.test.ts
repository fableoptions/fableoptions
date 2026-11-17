import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import { FableStore } from "../storage.js";
import { assessTrackedToken } from "./token-risk-view.js";
import type {OwnershipAudit} from "./ownership-audit.js";

test("stores raw holder signals but never creates a verified bundle claim", {timeout:25000},async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires isolated test PostgreSQL");return;}
 const store=new FableStore(process.env.DATABASE_URL);
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
 await store.init();
 const mint="owner-audit-"+randomUUID(),now=new Date();
 try {
  await store.recordLaunch({mint,signature:"audit-"+randomUUID(),slot:44,
   name:"Audit Test",symbol:"A",uri:"https://example.invalid",instruction:"create_v2"});
  await store.recordPrice({
   mint,marketCapUsd:400000,poolLiquidityUsd:35000,
   poolAddress:"pool",observedAt:now,source:"dexscreener"
  });
  const audit:OwnershipAudit={
    mint,observedAt:now.toISOString(),contextSlot:450,
    supplyAtomic:"1000000000",topTokenAccountPct:30,
    topTenTokenAccountsPct:60,topTwentyAccountsCount:20,
    distinctVisibleOwners:18,repeatedOwnerAccountCount:2,
    mintAuthorityRevoked:true,freezeAuthorityRevoked:true,
    holderAccountsClassified:false,walletClustersVerified:false,
    bundleEvidence:"unknown",
    riskSignals:["TOP_TOKEN_ACCOUNT_EXCEEDS_15_PCT_UNCLASSIFIED"],
    coverage:{largestAccountsCap:20,allHoldersEnumerated:false,
      vaultsExcluded:false,creatorFundingTraced:false,sameSlotBuysReconstructed:false}
  };
  await store.recordOwnershipAudit(audit);
  const row=await store.tokenRiskRow(mint);
  assert.equal(Number(row.top_account_pct),30);
  assert.equal(row.mint_authority_revoked,true);
  const risk=assessTrackedToken(row,now);
  assert.equal(risk.optionListingAllowed,false);
  assert.equal(risk.ownershipEvidence.beneficialOwnersVerified,false);
  assert.equal(risk.ownershipEvidence.bundleProven,false);
  assert.ok(risk.reasons.includes("UNCLASSIFIED_OWNERSHIP_CONCENTRATION_REVIEW"));
  // Future or spoofed RPC results may not claim verified clustering.
  await assert.rejects(store.recordOwnershipAudit({...audit,walletClustersVerified:true} as unknown as OwnershipAudit));
  // Old slots cannot overwrite newer evidence.
  await store.recordOwnershipAudit({...audit,contextSlot:100,topTokenAccountPct:0});
  const reread=await store.tokenRiskRow(mint);
  assert.equal(Number(reread.top_account_pct),30);
 }finally{
  await db.end();await store.close();
 }
});
test("candidate selection uses above-threshold sampled prices", {timeout:25000},async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires isolated test DB");return;}
 const store=new FableStore(process.env.DATABASE_URL);await store.init();
 const mint="ownership-candidate-"+randomUUID(),now=new Date();
 try{
  await store.recordLaunch({mint,signature:"audit-"+randomUUID(),slot:45,
   name:"Candidate Test",symbol:"C",uri:"https://example.invalid",instruction:"create_v2"});
  await store.recordPrice({mint,marketCapUsd:350000,poolLiquidityUsd:35000,
   poolAddress:"pool",observedAt:now,source:"dexscreener"});
  const candidate=await store.dueOwnershipAudit();
  assert.ok(candidate);
 }finally{await store.close();}
});
