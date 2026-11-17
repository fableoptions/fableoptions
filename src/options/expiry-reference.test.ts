import test from "node:test";
import assert from "node:assert/strict";
import {assessExpiryCapWindow,type CapObservation} from "./expiry-reference.js";
const mint="31qACV9dPCTbcRky4mv4WRnFFMKy2infA41KHDoTpump";
const end=new Date("2026-11-17T15:00:00Z");
const start=new Date(end.getTime()-600000);
function samples(cap=400000):CapObservation[]{
 return Array.from({length:11},(_,i)=>({
  observedAt:new Date(start.getTime()+i*60000),
  marketCapUsd:cap,liquidityUsd:90000,source:"dexscreener",poolAddress:"pool"
 }));
}
test("dense constant high-liquidity market-cap samples produce indicative average only",()=>{
 const x=assessExpiryCapWindow(mint,samples(),start,end);
 assert.equal(x.status,"sampled_reference_only");
 assert.equal(x.sampledMarketCapTwapUsd,400000);
 assert.equal(x.underlyingTokenPriceUsd,null);
 assert.equal(x.validSettlementOracle,false);
 assert.equal(x.executable,false);
});
test("time-weighted reference differs from unweighted mean",()=>{
 const s=samples();for(let i=7;i<s.length;i++)s[i].marketCapUsd=600000;
 const x=assessExpiryCapWindow(mint,s,start,end);
 assert.equal(x.status,"sampled_reference_only");
 assert.equal(x.sampledMarketCapTwapUsd,460000);
});
test("missing intervals and thin history fail closed",()=>{
 assert.equal(assessExpiryCapWindow(mint,samples().slice(0,4),start,end).sampledMarketCapTwapUsd,null);
 const s=samples().filter((_,i)=>i!==5&&i!==6);
 const x=assessExpiryCapWindow(mint,s,start,end);
 assert.equal(x.status,"insufficient_data");
 assert.ok(x.reasonCodes.includes("STALE_OR_MISSING_INTERVALS"));
});
test("extreme flash pump and pool switches are quarantined",()=>{
 const spike=samples();spike[5].marketCapUsd=1_400_000;
 const x=assessExpiryCapWindow(mint,spike,start,end);
 assert.equal(x.status,"quarantined");
 assert.ok(x.reasonCodes.includes("EXTREME_INTER_SAMPLE_CHANGE"));
 const switched=samples();switched[3].poolAddress="other";
 assert.equal(assessExpiryCapWindow(mint,switched,start,end).status,"quarantined");
});
test("bonding-curve market cap and missing liquidity never become expiry settlement value",()=>{
 const curve=samples().map(x=>({...x,source:"pump_bonding_curve_solana",liquidityUsd:null}));
 const x=assessExpiryCapWindow(mint,curve,start,end);
 assert.equal(x.status,"quarantined");
 assert.equal(x.sampledMarketCapTwapUsd,null);
 assert.equal(x.validSettlementOracle,false);
});
test("rejects invalid windows rather than guessing coverage",()=>{
 assert.throws(()=>assessExpiryCapWindow(mint,samples(),start,new Date(start.getTime()+60_000)),/invalid_reference_window/);
});
