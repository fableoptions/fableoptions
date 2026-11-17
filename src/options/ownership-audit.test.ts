import test from "node:test";
import assert from "node:assert/strict";
import {interpretOwnershipSnapshot,fetchOwnershipAudit} from "./ownership-audit.js";
const mint="31qACV9dPCTbcRky4mv4WRnFFMKy2infA41KHDoTpump";
const a="So11111111111111111111111111111111111111112";
const b="11111111111111111111111111111111";
test("unclassified token accounts are never asserted to be individual holders",()=>{
 const audit=interpretOwnershipSnapshot(mint,{amount:"1000000000"},[
  {address:a,amount:"300000000"},{address:b,amount:"250000000"}
 ],[
  {data:{parsed:{info:{owner:a,mint,tokenAmount:{amount:"300000000"}}}}},
  {data:{parsed:{info:{owner:a,mint,tokenAmount:{amount:"250000000"}}}}}
 ],{data:{parsed:{info:{mintAuthority:null,freezeAuthority:null}}}});
 assert.equal(audit.topTokenAccountPct,30);
 assert.equal(audit.topTenTokenAccountsPct,55);
 assert.equal(audit.distinctVisibleOwners,1);
 assert.equal(audit.repeatedOwnerAccountCount,1);
 assert.equal(audit.bundleEvidence,"unknown");
 assert.equal(audit.holderAccountsClassified,false);
 assert.equal(audit.mintAuthorityRevoked,true);
 assert.ok(audit.riskSignals.includes("TOP_TEN_TOKEN_ACCOUNTS_EXCEED_50_PCT_UNCLASSIFIED"));
});
test("rejects inconsistent supply and unparsed account ownership remains unknown",()=>{
 assert.throws(()=>interpretOwnershipSnapshot(mint,{amount:"10"},[{address:a,amount:"11"}],[null],null));
 const x=interpretOwnershipSnapshot(mint,{amount:"100"},[{address:a,amount:"15"}],[null],null);
 assert.equal(x.distinctVisibleOwners,null);
 assert.equal(x.mintAuthorityRevoked,null);
});
test("RPC calls use confirmed getTokenSupply, largest token accounts and parsed owners",async()=>{
 const calls:string[]=[];
 const fake=async(_url:unknown,args:unknown)=>{
  const v=JSON.parse((args as {body:string}).body);
  calls.push(v.method);
  const result=v.method==="getTokenSupply"
   ? {context:{slot:100},value:{amount:"100000"}}
   :v.method==="getTokenLargestAccounts"
   ? {context:{slot:101},value:[{address:a,amount:"40000"}]}
   : {context:{slot:102},value:[
     {data:{parsed:{info:{mintAuthority:null,freezeAuthority:null}}}},
     {data:{parsed:{info:{owner:b,mint,tokenAmount:{amount:"40000"}}}}}
    ]};
  return {ok:true,status:200,json:async()=>({result})};
 };
 const result=await fetchOwnershipAudit("https://example.com",mint,fake as unknown as typeof fetch);
 assert.deepEqual(calls,["getTokenSupply","getTokenLargestAccounts","getMultipleAccounts"]);
 assert.equal(result.topTokenAccountPct,40);
 assert.equal(result.holderAccountsClassified,false);
});
test("RPC snapshot slot skew cannot be reported as verified",async()=>{
 const fake=async(_url:unknown,args:unknown)=>{
  const method=JSON.parse((args as {body:string}).body).method;
  const result=method==="getTokenSupply"?{context:{slot:100},value:{amount:"100"}}
   :method==="getTokenLargestAccounts"?{context:{slot:900},value:[]}
   :{context:{slot:900},value:[null]};
  return {ok:true,status:200,json:async()=>({result})};
 };
 await assert.rejects(fetchOwnershipAudit("https://example.com",mint,fake as unknown as typeof fetch),/slot_drift/);
});
