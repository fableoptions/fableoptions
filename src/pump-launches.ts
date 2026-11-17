import { decodeLaunches, PUMP_PROGRAM_ID, type ParsedTx } from "./pump-decode.js";
const apiKey = process.env.HELIUS_API_KEY;
const wsUrl = process.env.SOLANA_WS_URL ?? (apiKey ? `wss://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}` : "");
const rpcUrl = process.env.SOLANA_RPC_URL ?? (apiKey ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}` : "");
if (!wsUrl.startsWith("wss://") || !rpcUrl.startsWith("https://")) throw new Error("Configure HELIUS_API_KEY locally, or SOLANA_WS_URL and SOLANA_RPC_URL");
let shuttingDown = false;
let ws: WebSocket | undefined;
const seen = new Set<string>();
const queue: string[] = [];
let active = 0;
async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res=await fetch(rpcUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(15000)});
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json=await res.json() as {result?:unknown;error?:unknown};
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}
async function processSignature(sig: string) {
  try {
    let tx: unknown = null;
    for (let attempt=0;attempt<5 && !tx;attempt++) {
      tx=await rpc("getTransaction",[sig,{encoding:"jsonParsed",commitment:"confirmed",maxSupportedTransactionVersion:0}]);
      if (!tx) await new Promise(r=>setTimeout(r,600*(attempt+1)));
    }
    if (!tx) throw new Error("transaction unavailable after retries");
    for (const launch of decodeLaunches(tx as ParsedTx)) {
      process.stdout.write(JSON.stringify({event:"pump_launch",...launch,verifiedInstruction:true,marketCapUsd:null,optionsAvailable:false})+"\n");
    }
  } catch(e) {process.stderr.write(`[fable] decode failed ${sig}: ${String(e)}\n`);}
}
function drain() {
  while(active<3 && queue.length) {
    const sig=queue.shift()!;active++;
    void processSignature(sig).finally(()=>{active--;drain();});
  }
}
function connect() {
  if(shuttingDown)return;
  ws=new WebSocket(wsUrl);
  ws.addEventListener("open",()=>ws?.send(JSON.stringify({jsonrpc:"2.0",id:1,method:"logsSubscribe",params:[{mentions:[PUMP_PROGRAM_ID]},{commitment:"confirmed"}]})));
  ws.addEventListener("message",e=>{
    try {
      const msg=JSON.parse(String(e.data)) as {error?:unknown;method?:string;params?:{result?:{value?:{signature?:string;err?:unknown}}}};
      if(msg.error){process.stderr.write("[fable] subscription error "+JSON.stringify(msg.error)+"\n");return;}
      const v=msg.params?.result?.value;
      if(msg.method!=="logsNotification" || !v?.signature || v.err || seen.has(v.signature))return;
      seen.add(v.signature);
      if(seen.size>100000)seen.clear();
      if(queue.length>10000){process.stderr.write("[fable] queue overflow: dropped signature, backfill required\n");return;}
      queue.push(v.signature);drain();
    }catch(err){process.stderr.write("[fable] bad WS message "+String(err)+"\n");}
  });
  ws.addEventListener("error",()=>process.stderr.write("[fable] websocket error\n"));
  ws.addEventListener("close",()=>{if(!shuttingDown){process.stderr.write("[fable] websocket disconnected; historical gap recovery required\n");setTimeout(connect,3000);}});
}
process.on("SIGINT",()=>{shuttingDown=true;ws?.close();process.exit(0);});
connect();
