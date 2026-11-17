import test from "node:test";
import assert from "node:assert/strict";
import {inferFundingLinks,fetchFundingLinks} from "./funding-links.js";
const mint="31qACV9dPCTbcRky4mv4WRnFFMKy2infA41KHDoTpump";
const w1="So11111111111111111111111111111111111111112";
const w2="11111111111111111111111111111111";
const funder="SysvarRent111111111111111111111111111111111";
const launch=1800000000;
function transfer(wallet:string,from=funder,when=launch-120,amount=2_000_000_000){
 return {blockTime:when,meta:{err:null},transaction:{message:{instructions:[
  {program:"system",parsed:{type:"transfer",info:{source:from,destination:wallet,lamports:amount}}}
 ]}}};
}
test("common sender to two wallets is a review signal not shared ownership proof",()=>{
 const r=inferFundingLinks(mint,launch,[w1,w2],[
  {wallet:w1,signature:"sig1",tx:transfer(w1)},
  {wallet:w2,signature:"sig2",tx:transfer(w2)}
 ]);
 assert.equal(r.possibleSharedFunding,true);
 assert.equal(r.commonFundingSources[0].recipientCount,2);
 assert.equal(r.commonControlProven,false);
 assert.equal(r.status,"partial_with_link_signal");
});
test("no observed link is incomplete rather than independent",()=>{
 const r=inferFundingLinks(mint,launch,[w1,w2],[
  {wallet:w1,signature:"s1",tx:transfer(w1)},
  {wallet:w2,signature:"s2",tx:transfer(w2,w1)}
 ]);
 assert.equal(r.possibleSharedFunding,false);
 assert.equal(r.status,"partial_no_link_detected");
 assert.ok(r.limitations.some(x=>x.includes("does not establish independence")));
});
test("ignore transactions after launch, dust and failed transactions",()=>{
 const r=inferFundingLinks(mint,launch,[w1,w2],[
  {wallet:w1,signature:"after",tx:transfer(w1,funder,launch+5)},
  {wallet:w2,signature:"dust",tx:transfer(w2,funder,launch-60,1000)},
  {wallet:w1,signature:"failed",tx:{...transfer(w1),meta:{err:"failed"}}}
 ]);
 assert.equal(r.qualifyingTransfers.length,0);
});
test("RPC bounds are at most 3 signatures per wallet",async()=>{
 const calls:string[]=[];
 const fetcher=async(_url:unknown,opts:unknown)=>{
   const body=JSON.parse((opts as {body:string}).body);
   calls.push(body.method);
   if(body.method==="getSignaturesForAddress"){
     assert.equal(body.params[1].limit,3);
     return {status:200,ok:true,json:async()=>({result:[{signature:"test",err:null}]})};
   }
   return {status:200,ok:true,json:async()=>({result:transfer(body.params[0]==="test"?w1:w2)})};
 };
 const result=await fetchFundingLinks("https://example.com",mint,launch,[w1],fetcher as unknown as typeof fetch);
 assert.equal(result.scannedWallets,1);
 assert.deepEqual(calls,["getSignaturesForAddress","getTransaction"]);
});
test("429 is a failure and cannot be misreported as no funding links",async()=>{
 const fetcher=async()=>({status:429,ok:false});
 await assert.rejects(fetchFundingLinks("https://example.com",mint,launch,[w1],
   fetcher as unknown as typeof fetch),/RATE_LIMIT/);
});
