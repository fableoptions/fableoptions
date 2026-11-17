import test from "node:test";
import assert from "node:assert/strict";
import { venueReadiness, ensureExecutableVenue, reportVerificationEvidence } from "./venue-readiness.js";
import { ExecutionNotAvailable } from "./settlement.js";
test("production venue is fail-closed even if feature flags are present",()=>{
  const prior=process.env.RFQ_API_ENABLED;
  process.env.RFQ_API_ENABLED="true";
  try {
    const status=venueReadiness();
    assert.equal(status.acceptingTrades,false);
    assert.equal(status.acceptingDeposits,false);
    assert.equal(status.quoteExecutable,false);
    assert.equal(status.collateralVerified,false);
    assert.throws(()=>ensureExecutableVenue(),ExecutionNotAvailable);
  } finally {
    if(prior===undefined) delete process.env.RFQ_API_ENABLED;
    else process.env.RFQ_API_ENABLED=prior;
  }
});
test("untrusted reported funding does not imply executable liquidity",()=>{
  const observed=reportVerificationEvidence({
    positionId:"example",transactionSignature:"untrusted",observedSlot:12345,
    finalized:true,collateralAccountVerified:true,escrowBalanceVerified:true,
    programUpgradeAuthorityReviewed:true,settlementOracleVerified:true
  });
  assert.equal(observed.independentlyVerified,false);
  assert.equal(observed.executable,false);
});
