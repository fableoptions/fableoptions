import test from "node:test";
import assert from "node:assert/strict";
import { decodePumpCurve,estimateCurveMarketCapUsd,fetchPumpCurveSnapshots,
  fetchSolUsd,pumpCurveAddress } from "./pump-curve-provider.js";
import {PUMP_PROGRAM_ID} from "./pump-decode.js";
const mint="31qACV9dPCTbcRky4mv4WRnFFMKy2infA41KHDoTpump";
function exampleCurve(quoteNonSol=false,complete=false,mayhem=false){
  const b=Buffer.alloc(240);
  Buffer.from([23,183,248,55,96,216,172,96]).copy(b,0);
  b.writeBigUInt64LE(1_073_000_000_000_000n,8);
  b.writeBigUInt64LE(30_000_000_000n,16);
  b.writeBigUInt64LE(793_100_000_000_000n,24);
  b.writeBigUInt64LE(10_000_000_000n,32);
  b.writeBigUInt64LE(1_000_000_000_000_000n,40);
  b[48]=complete?1:0;
  b[81]=mayhem?1:0;
  if(quoteNonSol)Buffer.alloc(32,1).copy(b,83);
  return b;
}
test("official curve layout produces plausible SOL-quoted market cap",()=>{
 const curve=decodePumpCurve(exampleCurve(),PUMP_PROGRAM_ID);
 assert.ok(curve);
 assert.equal(curve?.quoteMint,"11111111111111111111111111111111");
 const cap=estimateCurveMarketCapUsd(curve!,200);
 assert.ok(cap!>5000&&cap!<6000);
});
test("excludes wrong owners, non-SOL quotes, mayhem and completed curves",()=>{
 assert.equal(decodePumpCurve(exampleCurve(),"not-pump"),null);
 assert.equal(decodePumpCurve(exampleCurve(true),PUMP_PROGRAM_ID),null);
 assert.equal(decodePumpCurve(exampleCurve(false,true),PUMP_PROGRAM_ID),null);
 assert.equal(decodePumpCurve(exampleCurve(false,false,true),PUMP_PROGRAM_ID),null);
 assert.equal(decodePumpCurve(Buffer.from("bad"),PUMP_PROGRAM_ID),null);
});
test("PDA stable and batch RPC must match owner and slot",async()=>{
 const address=pumpCurveAddress(mint);
 assert.ok(address.length>=32&&address.length<=44);
 const fake=async (_url:unknown, init:unknown)=>{
  const req=JSON.parse(String((init as {body:string}).body));
  assert.equal(req.method,"getMultipleAccounts");
  assert.equal(req.params[0][0],address);
  return {ok:true,status:200,json:async()=>({result:{context:{slot:470580529},
   value:[{owner:PUMP_PROGRAM_ID,data:[exampleCurve().toString("base64"),"base64"]}]}})};
 };
 const samples=await fetchPumpCurveSnapshots("https://example.com",[mint],200,fake as unknown as typeof fetch);
 assert.equal(samples.length,1);
 assert.equal(samples[0].poolLiquidityUsd,null);
 assert.equal(samples[0].settlementOracle,false);
 assert.equal(samples[0].contextSlot,470580529);
});
test("invalid SOL quote rejects without defaulting to guessed USD rates",async()=>{
 const fake=async()=>({ok:true,status:200,json:async()=>({solana:{usd:null}})});
 assert.equal(await fetchSolUsd(fake as unknown as typeof fetch),null);
});
