import test from "node:test";
import assert from "node:assert/strict";
import {previewUsdcPayout,validateUsdcTerms,type UsdcOptionTerms} from "./usdc-settlement-model.js";
const base:UsdcOptionTerms={
 side:"call",underlyingMint:"31qACV9dPCTbcRky4mv4WRnFFMKy2infA41KHDoTpump",
 underlyingDecimals:6,sizeAtomic:"100000000000",
 strikePricePicoUsd:"2000000000",premiumMicroUsdc:"20000000",
 capMicroUsdc:"100000000",expiryUnixSeconds:1800000000
};
test("call pays mathematically correct USDC capped amount and cannot execute",()=>{
 const r=previewUsdcPayout(base,"5000000000");
 assert.equal(r.payoutMicroUsdc,"100000000"); // intrinsic 300 USDC, capped at 100
 assert.equal(r.buyerNetMicroUsdc,"80000000");
 assert.equal(r.requiredWriterCollateralMicroUsdc,"100000000");
 assert.equal(r.payoutCapped,true);
 assert.equal(r.collateralOnchainVerified,false);
 assert.equal(r.transactionAuthorized,false);
 assert.equal(r.settled,false);
});
test("unprofitable call loses only its premium",()=>{
 const r=previewUsdcPayout(base,"1000000000");
 assert.equal(r.payoutMicroUsdc,"0");
 assert.equal(r.buyerNetMicroUsdc,"-20000000");
});
test("put pays without physical delivery, capped at writer collateral",()=>{
 const r=previewUsdcPayout({...base,side:"put",capMicroUsdc:"500000000"},"500000000");
 assert.equal(r.payoutMicroUsdc,"150000000");
 assert.equal(r.buyerNetMicroUsdc,"130000000");
 assert.equal(r.payoutCapped,false);
});
test("fractional smallest-unit math rounds down conservatively",()=>{
 const r=previewUsdcPayout({...base,sizeAtomic:"1",underlyingDecimals:9,
  strikePricePicoUsd:"1",capMicroUsdc:"10"},"2");
 assert.equal(r.payoutMicroUsdc,"0");
});
test("malformed atomic decimal and huge inputs fail closed",()=>{
 for(const sizeAtomic of ["-10","1.5","1e9","NaN",""]){
   assert.throws(()=>validateUsdcTerms({...base,sizeAtomic}));
 }
 assert.throws(()=>validateUsdcTerms({...base,underlyingDecimals:20}));
 assert.throws(()=>previewUsdcPayout(base,"-1"));
 assert.throws(()=>previewUsdcPayout(base,"1.01"));
 assert.throws(()=>previewUsdcPayout(base,"999999999999999999999999999999999"));
});
test("expired token terms cannot be mistaken for a signed trade",()=>{
 const r=previewUsdcPayout(base,"3000000000");
 assert.equal(r.expiryPriceOracleVerified,false);
 assert.equal(r.collateralMustBeLockedBeforeTrade,true);
 assert.equal(r.transactionAuthorized,false);
});
