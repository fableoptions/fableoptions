import pg from "pg";
import { decodeLaunches, PUMP_PROGRAM_ID, type ParsedTx } from "./pump-decode.js";
import { FableStore } from "./storage.js";
import { SignatureQueue } from "./ingest-queue.js";

/**
 * Mainnet activity subscriber with durable transaction job tracking.
 * It is not a complete historical indexer; Solana RPC gaps still need backfill.
 */
const key=process.env.HELIUS_API_KEY;
const wsUrl=process.env.SOLANA_WS_URL ?? (key?`wss://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`:"");
const rpcUrl=process.env.SOLANA_RPC_URL ?? (key?`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`:"");
const databaseUrl=process.env.DATABASE_URL;
if(!wsUrl.startsWith("wss://")||!rpcUrl.startsWith("https://")||!databaseUrl)
  throw new Error("HELIUS_API_KEY (or RPC endpoints) and DATABASE_URL are required");
const store=new FableStore(databaseUrl);
const pool=new pg.Pool({connectionString:databaseUrl,max:3,connectionTimeoutMillis:8000});
const jobs=new SignatureQueue(pool);
await store.init();
await jobs.init();

const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
let stopping=false;
let ws:WebSocket|undefined;
let earliestRequest=0;
let backoffUntil=0;
let subscriptionId:number|null=null;
let reconnectDelay=3000;
async function rpc(method:string,params:unknown[]):Promise<unknown>{
  await sleep(Math.max(0,earliestRequest-Date.now(),backoffUntil-Date.now()));
  earliestRequest=Date.now()+1200;
  const response=await fetch(rpcUrl,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(15000)});
  if(response.status===429){
    const retry=Number(response.headers.get("retry-after"));
    backoffUntil=Date.now()+(Number.isFinite(retry)&&retry>0?Math.min(180000,retry*1000):60000);
    throw new Error("RPC_RATE_LIMITED");
  }
  if(!response.ok)throw new Error(`RPC_HTTP_${response.status}`);
  const json=await response.json() as {result?:unknown;error?:{code?:number;message?:string}};
  if(json.error?.code===429||json.error?.code===-32005){
    backoffUntil=Date.now()+60000;
    throw new Error("RPC_RATE_LIMITED");
  }
  if(json.error)throw new Error(`RPC_ERROR_${json.error.code??"unknown"}`);
  return json.result;
}
async function handleSignature(signature:string){
  const transaction=await rpc("getTransaction",[
    signature,{encoding:"jsonParsed",commitment:"confirmed",maxSupportedTransactionVersion:1}
  ]);
  if(!transaction)throw new Error("TRANSACTION_NOT_AVAILABLE");
  const launches=decodeLaunches(transaction as ParsedTx);
  for(const launch of launches){
    const first=await store.recordLaunch(launch);
    if(first)process.stdout.write(JSON.stringify({
      event:"pump_launch",...launch,verifiedInstruction:true,
      marketCapUsd:null,optionsAvailable:false
    })+"\n");
  }
}
async function work(){
  while(!stopping){
    try{
      const job=await jobs.claim();
      if(!job){await sleep(1000);continue;}
      try{
        await handleSignature(job.signature);
        await jobs.complete(job.signature);
      }catch(error){
        const message=String(error);
        const retryAfter=message.includes("RATE_LIMITED")?70:
          message.includes("NOT_AVAILABLE")?15:Math.min(300,2**Math.min(job.tries,8));
        await jobs.retry(job.signature,job.tries,message,retryAfter);
        if(job.tries===1||job.tries%5===0)
          process.stderr.write(`[fable] transaction deferred (attempt ${job.tries}): ${message}\n`);
      }
    }catch(error){
      process.stderr.write(`[fable] queue unavailable: ${String(error)}\n`);
      await sleep(5000);
    }
  }
}
function connect(){
  if(stopping)return;
  const socket=new WebSocket(wsUrl);
  ws=socket;subscriptionId=null;
  socket.addEventListener("open",()=>{
    reconnectDelay=3000;
    socket.send(JSON.stringify({jsonrpc:"2.0",id:1,method:"logsSubscribe",
      params:[{mentions:[PUMP_PROGRAM_ID]},{commitment:"confirmed"}]}));
    process.stderr.write("[fable] logs stream connected; gaps require historical backfill\n");
  });
  socket.addEventListener("message",event=>{
    try{
      const message=JSON.parse(String(event.data)) as {
        id?:number;result?:number;error?:{message?:string};method?:string;
        params?:{result?:{context?:{slot?:number};value?:{
          signature?:string;err?:unknown;logs?:string[]}}}
      };
      if(message.error){process.stderr.write("[fable] subscription error: "+message.error.message+"\n");return;}
      if(message.id===1&&typeof message.result==="number"){subscriptionId=message.result;return;}
      const v=message.params?.result?.value;
      if(message.method!=="logsNotification"||!v?.signature||v.err)return;
      // Logs indicate a create-like instruction; actual launch is verified by decoding the transaction.
      if(!v.logs?.some(line=>/Instruction: Create(?:V2)?(?:\b|$)/i.test(line)))return;
      void jobs.enqueue(v.signature,message.params?.result?.context?.slot??null)
        .catch(error=>process.stderr.write("[fable] durable enqueue failed: "+String(error)+"\n"));
    }catch(error){process.stderr.write("[fable] malformed log: "+String(error)+"\n");}
  });
  socket.addEventListener("error",()=>process.stderr.write("[fable] websocket error\n"));
  socket.addEventListener("close",()=>{
    if(stopping)return;
    process.stderr.write("[fable] disconnected; historical gap recovery needed\n");
    const wait=reconnectDelay;
    reconnectDelay=Math.min(30000,reconnectDelay*2);
    setTimeout(connect,wait);
  });
}
process.once("SIGTERM",()=>{stopping=true;ws?.close();});
process.once("SIGINT",()=>{stopping=true;ws?.close();});
void work();
connect();
