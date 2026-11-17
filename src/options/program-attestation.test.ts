import test from "node:test";
import assert from "node:assert/strict";
import bs58 from "bs58";
import {parseUpgradeableProgram,inspectProgramOnMainnet} from "./program-attestation.js";

const programId="BPFLoaderUpgradeab1e11111111111111111111111";
const authority=bs58.encode(Buffer.alloc(32,7));
const dataAddr=bs58.encode(Buffer.alloc(32,9));
function accountProgram(){
 const bytes=Buffer.alloc(36);
 bytes.writeUInt32LE(2,0);Buffer.alloc(32,9).copy(bytes,4);
 return {owner:programId,executable:true,data:[bytes.toString("base64"),"base64"] as [string,string]};
}
function dataAccount(mutability:boolean){
 const bytes=Buffer.alloc(60);
 bytes.writeUInt32LE(3,0);bytes.writeBigUInt64LE(12345n,4);
 bytes[12]=mutability?1:0;
 if(mutability)Buffer.alloc(32,7).copy(bytes,13);
 return {owner:programId,executable:false,data:[bytes.toString("base64"),"base64"] as [string,string]};
}
test("finalized loader info does not authorize a real option trade",()=>{
 const r=parseUpgradeableProgram(programId,accountProgram(),dataAccount(false),55555);
 assert.equal(r.status,"programdata_matched");
 assert.equal(r.programDataAddress,dataAddr);
 assert.equal(r.immutable,true);
 assert.equal(r.tradingAuthorized,false);
 assert.equal(r.escrowVerified,false);
 assert.equal(r.auditReviewed,false);
 assert.equal(r.settlementOracleVerified,false);
});
test("upgradeable program identifies unreviewed authority as a blocker",()=>{
 const r=parseUpgradeableProgram(programId,accountProgram(),dataAccount(true),55555);
 assert.equal(r.upgradeAuthority,authority);
 assert.equal(r.immutable,false);
 assert.ok(r.problems.includes("PROGRAM_UPGRADE_AUTHORITY_REQUIRES_REVIEW"));
 assert.equal(r.tradingAuthorized,false);
});
test("wrong loader / missing programdata fails closed",()=>{
 const invalid={...accountProgram(),owner:"bad-loader"};
 assert.equal(parseUpgradeableProgram(programId,invalid,null,55).status,"unverified");
 const incomplete=parseUpgradeableProgram(programId,accountProgram(),null,55);
 assert.equal(incomplete.status,"program_account_matched");
 assert.equal(incomplete.programDataVerified,false);
 assert.equal(incomplete.tradingAuthorized,false);
});
test("RPC verifies programdata at exact linked PDA address",async()=>{
 const calls:string[]=[];
 const fake=async(_u:unknown,init:unknown)=>{
  const request=JSON.parse((init as {body:string}).body);
  assert.equal(request.method,"getAccountInfo");
  assert.equal(request.params[1].commitment,"finalized");
  calls.push(request.params[0]);
  return {ok:true,status:200,json:async()=>({result:{
    context:{slot:1234},value:request.params[0]===programId?accountProgram():dataAccount(false)
  }})};
 };
 const r=await inspectProgramOnMainnet("https://example.org",programId,fake as unknown as typeof fetch);
 assert.deepEqual(calls,[programId,dataAddr]);
 assert.equal(r.status,"programdata_matched");
 assert.equal(r.tradingAuthorized,false);
});
test("RPC rate limit never becomes a successful attestation",async()=>{
 const fake=async()=>({status:429,ok:false});
 await assert.rejects(inspectProgramOnMainnet("https://example.org",programId,
   fake as unknown as typeof fetch),/RATE_LIMIT/);
});
