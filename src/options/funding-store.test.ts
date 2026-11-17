import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {FableStore} from "../storage.js";
import {assessTrackedToken} from "./token-risk-view.js";
import type {FundingLinkReport} from "./funding-links.js";
const wallet="So11111111111111111111111111111111111111112";
test("common funding review persists only cautious aggregate signals", {timeout:25000},async t=>{
 if(!process.env.DATABASE_URL){t.skip("test db required");return;}
 const store=new FableStore(process.env.DATABASE_URL);await store.init();
 const mint="funding-test-"+randomUUID();
 try{
  await store.recordLaunch({mint,signature:"f-"+randomUUID(),slot:100,
   name:"Funding",symbol:"F",uri:"https://example.invalid",instruction:"create_v2"});
  const report:FundingLinkReport={
    mint,launchUnixSeconds:1800000000,scannedWallets:2,
    recentTransactionsInspected:4,qualifyingTransfers:[],
    commonFundingSources:[{source:wallet,recipientCount:2,recipients:["a","b"]}],
    possibleSharedFunding:true,commonControlProven:false,
    status:"partial_with_link_signal",limitations:["not proof"]
  };
  await store.recordFundingReview(report);
  const row=await store.tokenRiskRow(mint);
  assert.equal(row.funding_status,"partial_with_link_signal");
  assert.equal(Number(row.common_funding_source_count),1);
  const risk=assessTrackedToken(row);
  assert.ok(risk.reasons.includes("POSSIBLE_COORDINATED_LAUNCH"));
  assert.equal(risk.fundingEvidence.commonControlProven,false);
  assert.equal(risk.optionListingAllowed,false);
  await assert.rejects(store.recordFundingReview(
    {...report,commonControlProven:true} as unknown as FundingLinkReport
  ));
 }finally{await store.close();}
});
test("failed funding RPC creates unavailable evidence rather than no link", {timeout:25000},async t=>{
 if(!process.env.DATABASE_URL){t.skip("test db required");return;}
 const store=new FableStore(process.env.DATABASE_URL);await store.init();
 const mint="funding-failure-"+randomUUID();
 try{
  await store.recordLaunch({mint,signature:"f-"+randomUUID(),slot:101,
   name:"Funding unavailable",symbol:"FU",uri:"https://example.invalid",instruction:"create_v2"});
  await store.recordFundingFailure(mint,"RPC_LIMIT");
  const row=await store.tokenRiskRow(mint);
  assert.equal(row.funding_status,"unavailable");
  const risk=assessTrackedToken(row);
  assert.equal(risk.fundingEvidence.commonControlProven,false);
 }finally{await store.close();}
});
