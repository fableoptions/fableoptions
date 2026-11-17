import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {FableStore} from "./storage.js";
test("sampling favors near-threshold and recent launches; excludes aged backlog", {timeout:20000}, async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires isolated test PostgreSQL");return;}
 const store=new FableStore(process.env.DATABASE_URL);
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
 await store.init();
 const suffix=randomUUID();
 const near="near-"+suffix,recent="recent-"+suffix,old="old-"+suffix;
 try{
  for(const [mint,slot] of [[near,101],[recent,102],[old,103]] as const){
   await store.recordLaunch({mint,signature:"integration-"+randomUUID(),slot,
    name:"Selection test",symbol:"T",uri:"https://example.invalid",instruction:"create_v2"});
  }
  await db.query(`UPDATE launches SET
    first_seen=now()-interval '1 hour',latest_market_cap_usd=245000,next_poll_at=now()-interval '1 minute'
    WHERE mint=$1`,[near]);
  await db.query(`UPDATE launches SET next_poll_at=now()-interval '1 minute'
    WHERE mint=$1`,[recent]);
  await db.query(`UPDATE launches SET
    first_seen=now()-interval '3 days',next_poll_at=now()-interval '1 minute'
    WHERE mint=$1`,[old]);
  const due=await store.dueTokens(100);
  const selected=due.map(x=>x.mint);
  assert.ok(selected.includes(near));
  assert.ok(selected.includes(recent));
  assert.equal(selected.includes(old),false);
  assert.ok(selected.indexOf(near)<selected.indexOf(recent));
 }finally{
  await db.end();await store.close();
 }
});
