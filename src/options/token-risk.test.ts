import test from "node:test";
import assert from "node:assert/strict";
import {assessTokenRisk,type RiskInput} from "./token-risk.js";
const mint="31qACV9dPCTbcRky4mv4WRnFFMKy2infA41KHDoTpump";
const now=new Date("2026-11-17T18:00:00.000Z");
const good:RiskInput={
 mint,observedMarketCapUsd:500000,observedAt:"2026-11-17T17:59:00.000Z",
 liquidityUsd:80000,tokenCreatedAt:"2026-11-17T15:00:00.000Z",
 dataSource:"dexscreener",topHolderConcentrationPct:8,topTenConcentrationPct:30,
 holderAccountsClassified:true,launchBundleEvidence:"no_evidence_found",
 suspiciousVolumeEvidence:"none_observed",mintAuthorityRevoked:true,
 freezeAuthorityRevoked:true,independentPriceCheck:true
};
test("clean screen never unlocks real options",()=>{
 const x=assessTokenRisk(good,now);
 assert.equal(x.status,"passed_screen_not_tradable");
 assert.equal(x.optionListingAllowed,false);
 assert.equal(x.executionAllowed,false);
});
test("market cap alone can never authorize bundled token",()=>{
 const x=assessTokenRisk({...good,observedMarketCapUsd:4e6,
  launchBundleEvidence:"confirmed_high_risk"},now);
 assert.equal(x.status,"blocked");
 assert.ok(x.reasons.includes("HIGH_RISK_BUNDLE_EVIDENCE"));
});
test("unknown owner concentration and no observed liquidity require review",()=>{
 const x=assessTokenRisk({...good,liquidityUsd:null,holderAccountsClassified:false,
  launchBundleEvidence:"unknown"},now);
 assert.equal(x.status,"manual_review");
 assert.ok(x.reasons.includes("LIQUIDITY_NOT_VERIFIED"));
 assert.ok(x.reasons.includes("OWNERSHIP_CONCENTRATION_UNVERIFIED"));
});
test("freshly pumped concentrated token is blocked",()=>{
 const x=assessTokenRisk({...good,tokenCreatedAt:"2026-11-17T17:40:00.000Z",
  topHolderConcentrationPct:28},now);
 assert.equal(x.status,"blocked");
 assert.ok(x.reasons.includes("TOP_HOLDER_CONCENTRATION"));
});
test("stale prices cannot pass",()=>{
 const x=assessTokenRisk({...good,observedAt:"2026-11-17T17:50:00.000Z"},now);
 assert.equal(x.status,"blocked");
 assert.ok(x.reasons.includes("STALE_OR_INVALID_PRICE_SAMPLE"));
});
test("suspected coordinated launch is not called proven fraud",()=>{
 const x=assessTokenRisk({...good,launchBundleEvidence:"suspected"},now);
 assert.equal(x.status,"manual_review");
 assert.ok(x.reasons.includes("POSSIBLE_COORDINATED_LAUNCH"));
 assert.ok(!x.reasons.includes("HIGH_RISK_BUNDLE_EVIDENCE"));
});
