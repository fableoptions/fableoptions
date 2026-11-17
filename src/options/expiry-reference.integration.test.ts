import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {FableStore} from "../storage.js";
import {assessExpiryCapWindow} from "./expiry-reference.js";
test("stored sampled caps produce only an indicative read-only historical reference", {timeout:30000},async t=>{
 if(!process.env.DATABASE_URL){t.skip("isolated PostgreSQL required");return;}
 const store=new FableStore(process.env.DATABASE_URL);await store.init();
 const mint="historical-cap-"+randomUUID();
 const start=new Date(Date.now()-40*60000),end=new Date(start.getTime()+600000);
 try{
   await store.recordLaunch({mint,signature:"history-"+randomUUID(),slot:999,
     name:"History test",symbol:"HT",uri:"https://example.invalid",instruction:"create_v2"});
   for(let i=0;i<=10;i++){
     await store.recordPrice({
       mint,marketCapUsd:350000,poolLiquidityUsd:80000,
       poolAddress:"pool-a",observedAt:new Date(start.getTime()+i*60000),source:"dexscreener"
     });
   }
   const rows=await store.marketCapObservations(mint,start,end);
   assert.equal(rows.length,11);
   assert.equal(rows[0].source,"dexscreener");
   const result=assessExpiryCapWindow(mint,rows,start,end);
   assert.equal(result.status,"sampled_reference_only");
   assert.equal(result.sampledMarketCapTwapUsd,350000);
   assert.equal(result.validSettlementOracle,false);
   assert.equal(result.underlyingTokenPriceUsd,null);
   const again=await store.marketCapObservations(mint,start,end);
   assert.deepEqual(again,rows);
 } finally{await store.close();}
});
test("samples from unrelated sources cannot be silently combined into expiry prices", {timeout:30000},async t=>{
 if(!process.env.DATABASE_URL){t.skip("isolated PostgreSQL required");return;}
 const store=new FableStore(process.env.DATABASE_URL);await store.init();
 const mint="mixed-cap-"+randomUUID();
 const start=new Date(Date.now()-40*60000),end=new Date(start.getTime()+600000);
 try{
   await store.recordLaunch({mint,signature:"mixed-"+randomUUID(),slot:998,
      name:"Mixed source",symbol:"MX",uri:"https://example.invalid",instruction:"create_v2"});
   for(let i=0;i<=10;i++)await store.recordPrice({
     mint,marketCapUsd:400000,poolLiquidityUsd:i===5?null:80000,
     poolAddress:i<5?"pool-a":"curve",observedAt:new Date(start.getTime()+i*60000),
     source:i<5?"dexscreener":"pump_bonding_curve_solana"
   });
   const result=assessExpiryCapWindow(mint,await store.marketCapObservations(mint,start,end),start,end);
   assert.equal(result.status,"quarantined");
   assert.equal(result.sampledMarketCapTwapUsd,null);
 }finally{await store.close();}
});
