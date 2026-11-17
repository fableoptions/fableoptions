/**
 * Bounded same-slot *token acquisition* analysis, NOT identification of bots,
 * snipers, coordinated control, market manipulation or beneficial ownership.
 *
 * A positive token balance change can be a transfer, mint, swap, gift or
 * custodian movement. We exclude the creation transaction (large mint supply).
 * Only transactions from the specified block are considered; this never claims
 * coverage beyond the analyzed slot.
 */
import bs58 from "bs58";
const isWallet=(v:string):boolean=>{try{return bs58.decode(v).length===32;}catch{return false;}};
type Balance={accountIndex:number;mint?:string;owner?:string;uiTokenAmount?:{amount?:string}};
type Transaction={
  meta?:{err?:unknown;preTokenBalances?:Balance[]|null;postTokenBalances?:Balance[]|null};
  transaction?:{signatures?:string[]};
};
export type SlotAcquisitionSignal={
  mint:string;slot:number;transactionsExamined:number;
  transactionCountWithPositiveBalanceDelta:number;
  distinctReportedOwners:number;
  ownersWithMultiplePositiveDeltaTransactions:number;
  aggregatePositiveAtomic:string;
  launchUnixSeconds?:number|null;
  sampledAcquisitionWallets?:string[];
  participantCoverage:"partial_owner_fields"|"observed_balance_changes";
  possibleCoordination:"needs_review"|"not_established";
  fraudProven:false;
  bundlesProven:false;
  limitations:string[];
};
function positive(v:unknown):bigint|null{
 if(typeof v!=="string"||!/^(0|[1-9][0-9]*)$/.test(v)||v.length>40)return null;
 return BigInt(v);
}
export function analyzeLaunchSlot(
 mint:string,slot:number,launchSignature:string,transactions:Transaction[],
 launchUnixSeconds:number|null=null
):SlotAcquisitionSignal{
 if(!Number.isSafeInteger(slot)||slot<=0||transactions.length>5000||!launchSignature)
   throw new Error("invalid_slot_or_sample");
 const counts=new Map<string,number>();
 let withDelta=0,aggregate=0n,missingOwner=false,observed=0;
 for(const tx of transactions){
  if(tx.meta?.err||tx.transaction?.signatures?.[0]===launchSignature)continue;
  const pre=new Map<number,bigint>();
  for(const row of tx.meta?.preTokenBalances??[]){
   if(row.mint!==mint)continue;
   const amount=positive(row.uiTokenAmount?.amount);
   if(amount!==null)pre.set(row.accountIndex,amount);
  }
  let anyPositive=false;
  const ownersThisTx=new Set<string>();
  for(const row of tx.meta?.postTokenBalances??[]){
   if(row.mint!==mint)continue;
   const after=positive(row.uiTokenAmount?.amount);
   if(after===null)continue;
   const delta=after-(pre.get(row.accountIndex)??0n);
   if(delta<=0n)continue;
   aggregate+=delta;
   anyPositive=true;
   if(row.owner)ownersThisTx.add(row.owner);
   else missingOwner=true;
  }
  if(anyPositive){
   withDelta++;
   for(const owner of ownersThisTx)counts.set(owner,(counts.get(owner)??0)+1);
  }
  observed++;
 }
 return {
  mint,slot,transactionsExamined:observed,
  transactionCountWithPositiveBalanceDelta:withDelta,
  distinctReportedOwners:counts.size,
  ownersWithMultiplePositiveDeltaTransactions:[...counts.values()].filter(n=>n>1).length,
  aggregatePositiveAtomic:aggregate.toString(),
  launchUnixSeconds:Number.isSafeInteger(launchUnixSeconds)&&launchUnixSeconds!>0?launchUnixSeconds:null,
  sampledAcquisitionWallets:[...counts.keys()].filter(isWallet).slice(0,4),
  participantCoverage:missingOwner?"partial_owner_fields":"observed_balance_changes",
  possibleCoordination:withDelta>=3||[...counts.values()].some(n=>n>=2)?"needs_review":"not_established",
  fraudProven:false,bundlesProven:false,
  limitations:[
   "Positive token balance deltas cannot distinguish swaps from ordinary transfers or minting.",
   "Transaction owner fields are unverified beneficial ownership and may include pools/custody.",
   "Only one historical slot was analyzed; same-block co-appearance is not proof of coordinated control."
  ]
 };
}
export async function fetchLaunchSlot(
 rpcUrl:string,mint:string,slot:number,launchSignature:string,fetcher:typeof fetch=fetch
):Promise<SlotAcquisitionSignal>{
 if(!rpcUrl.startsWith("https://"))throw new Error("https_rpc_required");
 if(!Number.isSafeInteger(slot)||slot<=0)throw new Error("invalid_slot");
 const result=await fetcher(rpcUrl,{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getBlock",
   params:[slot,{encoding:"jsonParsed",transactionDetails:"full",
    maxSupportedTransactionVersion:1,rewards:false,commitment:"confirmed"}]}),
  signal:AbortSignal.timeout(25000)
 });
 if(result.status===429)throw new Error("SLOT_RPC_RATE_LIMITED");
 if(!result.ok)throw new Error("SLOT_RPC_HTTP_"+result.status);
 const MAX_RESPONSE_BYTES=8*1024*1024;
 const declared=Number(result.headers?.get("content-length")??0);
 if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){
  await result.body?.cancel();
  throw new Error("slot_response_too_large");
 }
 // Stream safely; a giant historical block should not exhaust worker memory.
 let payload:{
  result?:{transactions?:Transaction[];blockHeight?:number;blockTime?:number|null}|null;
  error?:{code?:number}
 };
 if(result.body){
  const reader=result.body.getReader();
  const chunks:Uint8Array[]=[];
  let size=0;
  try{
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    if(!value)continue;
    size+=value.byteLength;
    if(size>MAX_RESPONSE_BYTES)throw new Error("slot_response_too_large");
    chunks.push(value);
   }
  }finally{
   if(size>MAX_RESPONSE_BYTES)await reader.cancel();
   reader.releaseLock();
  }
  payload=JSON.parse(Buffer.concat(chunks).toString("utf8")) as typeof payload;
 }else{
  // Supports a deliberately small test stub without a readable response body.
  payload=await result.json() as typeof payload;
 }
 if(payload.error||!payload.result||!Array.isArray(payload.result.transactions))
   throw new Error("slot_rpc_unavailable_or_malformed");
 if(payload.result.transactions.length>5000)throw new Error("slot_sample_too_large");
 return analyzeLaunchSlot(mint,slot,launchSignature,payload.result.transactions,
   payload.result.blockTime??null);
}
