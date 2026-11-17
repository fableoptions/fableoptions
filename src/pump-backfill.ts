/**
 * Bounded, manually invoked recovery scan of recent Pump.fun program signatures.
 * This is NOT a complete backfill and may enqueue ordinary trades alongside launches.
 * Limit deliberately small to respect free-tier RPCs.
 */
import pg from "pg";
import { SignatureQueue } from "./ingest-queue.js";
import { PUMP_PROGRAM_ID } from "./pump-decode.js";
const key=process.env.HELIUS_API_KEY;
const rpcUrl=process.env.SOLANA_RPC_URL ?? (key?`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`:"");
const databaseUrl=process.env.DATABASE_URL;
if(!rpcUrl.startsWith("https://")||!databaseUrl)throw new Error("Set DATABASE_URL and HELIUS_API_KEY or SOLANA_RPC_URL");
const limit=Number(process.env.BACKFILL_SIGNATURE_LIMIT??10);
if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("BACKFILL_SIGNATURE_LIMIT must be 1..100");
const pool=new pg.Pool({connectionString:databaseUrl,max:2});
try{
  const queue=new SignatureQueue(pool);
  await queue.init();
  const response=await fetch(rpcUrl,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getSignaturesForAddress",
      params:[PUMP_PROGRAM_ID,{limit,commitment:"confirmed"}]}),
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error(`RPC HTTP ${response.status}`);
  const data=await response.json() as {result?:Array<{signature:string;slot:number;err:unknown}>;error?:unknown};
  if(data.error)throw new Error(JSON.stringify(data.error));
  let added=0;
  for(const item of data.result??[]){
    if(item.err===null && await queue.enqueue(item.signature,item.slot))added++;
  }
  process.stdout.write(JSON.stringify({
    event:"bounded_backfill",sampledSignatures:data.result?.length??0,queued:added,
    completeCoverage:false,warning:"Only the most recent N program signatures. Most will NOT be token creations; expensive to fully decode. No gap guarantee."
  })+"\n");
}finally{await pool.end();}
