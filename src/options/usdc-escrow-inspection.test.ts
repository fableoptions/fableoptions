import test from "node:test";
import assert from "node:assert/strict";
import {inspectUsdcTokenAccount,fetchUsdcAccountInspection} from "./usdc-escrow-inspection.js";
import {SOLANA_USDC_MINT} from "./usdc-settlement-model.js";
const account="So11111111111111111111111111111111111111112";
const authority="11111111111111111111111111111111";
const tokenProgram="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
function makeAccount(partial:Record<string,unknown>={}){
 return {
  owner:tokenProgram,executable:false,
  data:{program:"spl-token",parsed:{type:"account",info:{
    mint:SOLANA_USDC_MINT,owner:authority,state:"initialized",
    tokenAmount:{amount:"100000000",decimals:6},...partial
  }}}
 };
}
test("100 USDC account balance can be observed but never proves program escrow",()=>{
 const r=inspectUsdcTokenAccount(account,authority,"100000000",makeAccount(),500);
 assert.equal(r.evidenceConsistent,true);
 assert.equal(r.balanceMicroUsdc,"100000000");
 assert.equal(r.sufficientBalance,true);
 assert.equal(r.verifiedProgramControlledEscrow,false);
 assert.equal(r.fundsLockedForOption,false);
 assert.equal(r.realSettlementApproved,false);
});
test("wrong mint, owner, freeze state, delegate or missing funds fail closed",()=>{
 for(const patch of [
  {mint:account},{owner:account},{state:"frozen"},
  {delegate:account},{closeAuthority:account},
  {tokenAmount:{amount:"99999999",decimals:6}}
 ]){
  const r=inspectUsdcTokenAccount(account,authority,"100000000",makeAccount(patch),500);
  assert.equal(r.evidenceConsistent,false);
  assert.equal(r.realSettlementApproved,false);
 }
});
test("missing account and malformed requested balance are rejected",()=>{
 const r=inspectUsdcTokenAccount(account,authority,"100000000",null,500);
 assert.equal(r.evidenceConsistent,false);
 assert.equal(r.balanceMicroUsdc,null);
 assert.throws(()=>inspectUsdcTokenAccount(account,authority,"1e8",makeAccount(),500));
});
test("RPC reads finalized account and cannot turn observations into funding claims",async()=>{
 const methods:string[]=[];
 const fake=async(_url:unknown,init:unknown)=>{
  const body=JSON.parse((init as {body:string}).body);
  methods.push(body.method);
  assert.equal(body.params[1].commitment,"finalized");
  return {status:200,ok:true,json:async()=>({result:{context:{slot:1000},value:makeAccount()}})};
 };
 const result=await fetchUsdcAccountInspection("https://example.com",account,authority,"50000000",
  fake as unknown as typeof fetch);
 assert.deepEqual(methods,["getAccountInfo"]);
 assert.equal(result.sufficientBalance,true);
 assert.equal(result.realSettlementApproved,false);
});
test("RPC 429 cannot mark escrow verified",async()=>{
 const fake=async()=>({status:429,ok:false});
 await assert.rejects(fetchUsdcAccountInspection("https://example.com",account,authority,
  "100",fake as unknown as typeof fetch),/RATE_LIMIT/);
});
