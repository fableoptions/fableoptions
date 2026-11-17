import test from "node:test";
import assert from "node:assert/strict";
import {DisabledSettlementAdapter,fullyVerifiedSettlement,ExecutionNotAvailable} from "./settlement.js";
test("disabled live adapter cannot create or verify a trade",async()=>{
  const adapter=new DisabledSettlementAdapter();
  await assert.rejects(()=>adapter.readPosition("option"),ExecutionNotAvailable);
});
test("settlement verification is fail-closed",()=>{
  const data={positionId:"x",transactionSignature:"sig",observedSlot:42,
    finalized:true,collateralAccountVerified:true,escrowBalanceVerified:true,
    programUpgradeAuthorityReviewed:true,settlementOracleVerified:true};
  assert.equal(fullyVerifiedSettlement(data),true);
  assert.equal(fullyVerifiedSettlement({...data,escrowBalanceVerified:false}),false);
  assert.equal(fullyVerifiedSettlement({...data,finalized:false}),false);
});
