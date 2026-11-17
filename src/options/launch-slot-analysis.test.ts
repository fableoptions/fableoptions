import test from "node:test";
import assert from "node:assert/strict";
import {analyzeLaunchSlot,fetchLaunchSlot} from "./launch-slot-analysis.js";
const mint="31qACV9dPCTbcRky4mv4WRnFFMKy2infA41KHDoTpump";
const tx=(sig:string,owner:string,before:string,after:string)=>({
 transaction:{signatures:[sig]},meta:{err:null,
 preTokenBalances:[{mint,owner,accountIndex:1,uiTokenAmount:{amount:before}}],
 postTokenBalances:[{mint,owner,accountIndex:1,uiTokenAmount:{amount:after}}]}
});
test("same-slot repeated balance increases require investigation, not fraud declaration",()=>{
 const result=analyzeLaunchSlot(mint,470580529,"creation",[
  tx("creation","creator","0","1000000000"),
  tx("buy1","walletA","0","100"),
  tx("buy2","walletA","100","220"),
  tx("buy3","walletB","0","150")
 ]);
 assert.equal(result.transactionsExamined,3);
 assert.equal(result.transactionCountWithPositiveBalanceDelta,3);
 assert.equal(result.distinctReportedOwners,2);
 assert.equal(result.ownersWithMultiplePositiveDeltaTransactions,1);
 assert.equal(result.aggregatePositiveAtomic,"370");
 assert.equal(result.possibleCoordination,"needs_review");
 assert.equal(result.bundlesProven,false);
 assert.equal(result.fraudProven,false);
});
test("negative transfers and irrelevant assets do not create acquisition evidence",()=>{
 const result=analyzeLaunchSlot(mint,8,"creation",[
  tx("sell","holder","100","0"),
  {transaction:{signatures:["other"]},meta:{err:null,
   preTokenBalances:[],postTokenBalances:[{mint:"other",accountIndex:2,owner:"x",uiTokenAmount:{amount:"1000"}}]}}
 ]);
 assert.equal(result.transactionCountWithPositiveBalanceDelta,0);
 assert.equal(result.possibleCoordination,"not_established");
});
test("live slot RPC uses explicit version support and bounded response",async()=>{
 const fake=async(_u:unknown,args:unknown)=>{
  const body=JSON.parse((args as {body:string}).body);
  assert.equal(body.method,"getBlock");
  assert.equal(body.params[1].maxSupportedTransactionVersion,1);
  return {ok:true,status:200,json:async()=>({result:{transactions:[tx("buy1","w","0","100")]}})};
 };
 const result=await fetchLaunchSlot("https://example.com",mint,123,"creation",fake as unknown as typeof fetch);
 assert.equal(result.transactionCountWithPositiveBalanceDelta,1);
});
test("null historical data is not treated as no bundle",async()=>{
 const fake=async()=>({ok:true,status:200,json:async()=>({result:null})});
 await assert.rejects(fetchLaunchSlot("https://example.com",mint,123,"creation",
  fake as unknown as typeof fetch),/unavailable/);
});
