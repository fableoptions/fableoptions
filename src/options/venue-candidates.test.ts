import test from "node:test";
import assert from "node:assert/strict";
import {venueCandidateReport, VENUE_CANDIDATES} from "./venue-candidates.js";
test("all researched integration candidates fail closed",()=>{
  const report=venueCandidateReport();
  assert.equal(report.contractExecutionEnabled,false);
  assert.equal(report.noVenueCertified,true);
  assert.ok(VENUE_CANDIDATES.length>=3);
  for(const venue of VENUE_CANDIDATES){
    assert.equal(venue.status,"not_verified_for_fable");
    assert.equal(venue.callableIntegrationAvailable,false);
    assert.ok(venue.blockers.length>0);
    assert.ok(venue.evidenceUrls.every(url=>url.startsWith("https://")));
  }
});
