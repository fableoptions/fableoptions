import test from "node:test";
import assert from "node:assert/strict";
import {assessReconciliation,fetchRecentPumpSignatures} from "./pump-reconciliation.js";
const sig=(x:string)=>({signature:x,slot:123,err:null});
test("checkpoint in bounded page indicates overlap only",()=>{
 const report=assessReconciliation([sig("new"),sig("prior"),sig("old")],"prior",3);
 assert.equal(report.checkpointFound,true);
 assert.equal(report.gapDetected,false);
 assert.equal(report.coverage,"checkpoint_reached");
});
test("full page without checkpoint reports unresolved gap",()=>{
 const report=assessReconciliation([sig("new"),sig("other")],"prior",2);
 assert.equal(report.gapDetected,true);
 assert.equal(report.coverage,"gap_unresolved");
});
test("first-time sample never claims complete coverage",()=>{
 const report=assessReconciliation([sig("new")],null,1);
 assert.equal(report.coverage,"bounded_only");
});
test("history RPC excludes failed signatures and respects limit",async()=>{
 const fake=async(_url:unknown,opts:unknown)=>{
  const body=JSON.parse(String((opts as {body:string}).body));
  assert.equal(body.params[1].limit,2);
  return {ok:true,status:200,json:async()=>({result:[sig("a"),{...sig("b"),err:"failed"}]})};
 };
 const data=await fetchRecentPumpSignatures("https://example.com",2,fake as unknown as typeof fetch);
 assert.equal(assessReconciliation(data,null,2).eligible,1);
});
test("rate limited recovery rejects without fake coverage",async()=>{
 const fake=async()=>({ok:false,status:429});
 await assert.rejects(fetchRecentPumpSignatures("https://example.com",2,fake as unknown as typeof fetch),/RATE_LIMIT/);
});
