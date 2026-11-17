import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { FableStore } from "./storage.js";

test("Postgres price samples preserve source and correctly classify observed $300K crossings", {timeout:20000}, async t=>{
  if (!process.env.DATABASE_URL) {t.skip("requires isolated test DATABASE_URL");return;}
  const store=new FableStore(process.env.DATABASE_URL);
  await store.init();
  const mint="store-integration-"+randomUUID();
  const now=new Date();
  try {
    await store.recordLaunch({
      mint,signature:"integration-"+randomUUID(),slot:42,name:"Integration only",
      symbol:"TEST",uri:"https://example.invalid/test",instruction:"create_v2"
    });
    const base={mint,poolLiquidityUsd:20000,poolAddress:"pool-integration",source:"test-only"};
    const first=await store.recordPrice({...base,marketCapUsd:250000,observedAt:new Date(now.getTime()-120000)});
    assert.equal(first,null);
    const crossed=await store.recordPrice({...base,marketCapUsd:320000,observedAt:new Date(now.getTime()-60000)});
    assert.equal(crossed,"crossed_up");
    const again=await store.recordPrice({...base,marketCapUsd:400000,observedAt:now});
    assert.equal(again,null);
    const event=(await store.recentCrossings(100)).find((x:{mint:string})=>x.mint===mint);
    assert.equal(event.event_type,"crossed_up");
    assert.equal(event.price_source,"test-only");
    const token=(await store.recentLaunches(100)).find((x:{mint:string})=>x.mint===mint);
    assert.equal(token.latest_price_source,"test-only");
    assert.equal(Number(token.latest_market_cap_usd),400000);
  } finally {
    await store.close();
  }
});

test("stale below-threshold observation cannot be claimed as a timed crossing", {timeout:20000},async t=>{
  if(!process.env.DATABASE_URL){t.skip("requires isolated test DATABASE_URL");return;}
  const store=new FableStore(process.env.DATABASE_URL);
  await store.init();
  const mint="storage-stale-"+randomUUID();
  const now=new Date();
  try {
    await store.recordLaunch({mint,signature:"integration-"+randomUUID(),slot:43,
      name:"Stale integration",symbol:"ST",uri:"https://example.invalid",instruction:"create"});
    await store.recordPrice({mint,marketCapUsd:200000,poolLiquidityUsd:10000,poolAddress:"pool",
      observedAt:new Date(now.getTime()-3600000),source:"test-only"});
    const observed=await store.recordPrice({mint,marketCapUsd:350000,poolLiquidityUsd:15000,
      poolAddress:"pool",observedAt:now,source:"test-only"});
    assert.equal(observed,"first_seen_above");
  }finally{await store.close();}
});

test("older observations do not overwrite newer prices or invent crossings", {timeout:20000},async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires isolated test DB");return;}
 const store=new FableStore(process.env.DATABASE_URL);await store.init();
 const mint="storage-order-"+randomUUID(),now=new Date();
 try{
  await store.recordLaunch({mint,signature:"int-"+randomUUID(),slot:45,
   name:"Order test",symbol:"O",uri:"https://example.invalid",instruction:"create_v2"});
  await store.recordPrice({mint,marketCapUsd:400000,poolLiquidityUsd:10000,
   poolAddress:"pool",observedAt:now,source:"dexscreener"});
  const outOfOrder=await store.recordPrice({mint,marketCapUsd:100000,poolLiquidityUsd:5000,
   poolAddress:"pool",observedAt:new Date(now.getTime()-50000),source:"dexscreener"});
  assert.equal(outOfOrder,null);
  const token=(await store.recentLaunches(100)).find((x:{mint:string})=>x.mint===mint);
  assert.equal(Number(token.latest_market_cap_usd),400000);
 }finally{await store.close();}
});
test("different price provider does not claim continuous threshold crossing", {timeout:20000},async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires isolated test DB");return;}
 const store=new FableStore(process.env.DATABASE_URL);await store.init();
 const mint="storage-source-"+randomUUID(),now=new Date();
 try{
  await store.recordLaunch({mint,signature:"int-"+randomUUID(),slot:46,
   name:"Source test",symbol:"S",uri:"https://example.invalid",instruction:"create_v2"});
  await store.recordPrice({mint,marketCapUsd:250000,poolLiquidityUsd:10000,
   poolAddress:"pool",observedAt:new Date(now.getTime()-60000),source:"geckoterminal"});
  const event=await store.recordPrice({mint,marketCapUsd:350000,poolLiquidityUsd:20000,
   poolAddress:"pool",observedAt:now,source:"dexscreener"});
  assert.equal(event,"first_seen_above");
 }finally{await store.close();}
});
