/**
 * Bounded public Solana funding-link evidence for potential launch participants.
 * Public transaction history is neither a beneficial-ownership graph nor proof
 * of sybil control. Shared funders may be exchange/relay/custody accounts.
 *
 * Fetches at most 4 wallet histories and 3 transactions per wallet (16 RPCs).
 * Never requests private keys, signs messages, or moves funds.
 */
import bs58 from "bs58";
const validKey=(key:unknown):key is string=>{
  if(typeof key!=="string"||key.length<32||key.length>44)return false;
  try{return bs58.decode(key).length===32;}catch{return false;}
};
export type FundingTransfer={
  signature:string;recipient:string;source:string;lamports:string;blockTime:number;
};
export type FundingLinkReport={
  mint:string;launchUnixSeconds:number;scannedWallets:number;
  recentTransactionsInspected:number;qualifyingTransfers:FundingTransfer[];
  commonFundingSources:Array<{source:string;recipientCount:number;recipients:string[]}>;
  possibleSharedFunding:boolean;commonControlProven:false;
  status:"partial_with_link_signal"|"partial_no_link_detected";
  limitations:string[];
};
type ParsedInstruction={
  program?:string;parsed?:{type?:string;info?:{
    source?:string;destination?:string;lamports?:number|string;
  }};
};
type Transaction={
  blockTime?:number|null;meta?:{err?:unknown;innerInstructions?:Array<{
    instructions?:ParsedInstruction[];
  }>};transaction?:{message?:{instructions?:ParsedInstruction[]}};
};
export function inferFundingLinks(
 mint:string,launchUnixSeconds:number,wallets:string[],
 transactions:Array<{wallet:string;signature:string;tx:Transaction|null}>
):FundingLinkReport{
 if(!validKey(mint)||!Number.isSafeInteger(launchUnixSeconds)||
    launchUnixSeconds<=0||wallets.length>4||new Set(wallets).size!==wallets.length||
    wallets.some(w=>!validKey(w))||transactions.length>12)
   throw new Error("invalid_funding_sample");
 const allowed=new Set(wallets);
 const transfers:FundingTransfer[]=[];
 const seen=new Set<string>();
 for(const {wallet,signature,tx} of transactions){
   if(!allowed.has(wallet)||!tx||tx.meta?.err||!Number.isSafeInteger(tx.blockTime)||
      tx.blockTime!<=0||tx.blockTime!>launchUnixSeconds||
      launchUnixSeconds-tx.blockTime!>86400)continue;
   const instructions=[...(tx.transaction?.message?.instructions??[]),
     ...(tx.meta?.innerInstructions??[]).flatMap(x=>x.instructions??[])];
   for(const ix of instructions){
     if(ix.program!=="system"||ix.parsed?.type!=="transfer")continue;
     const data=ix.parsed.info;
     if(!data||data.destination!==wallet||!validKey(data.source)||
        data.source===wallet)continue;
     const value=String(data.lamports??"");
     if(!/^(0|[1-9][0-9]*)$/.test(value))continue;
     const amount=BigInt(value);
     // Ignore dust, rent top-ups and transfers outside range.
     if(amount<1_000_000n||amount>100_000_000_000_000n)continue;
     const identity=signature+":"+wallet+":"+data.source+":"+value;
     if(seen.has(identity))continue;
     seen.add(identity);
     transfers.push({signature,recipient:wallet,source:data.source,
       lamports:amount.toString(),blockTime:tx.blockTime!});
   }
 }
 const grouped=new Map<string,Set<string>>();
 for(const transfer of transfers){
   const members=grouped.get(transfer.source)??new Set<string>();
   members.add(transfer.recipient);
   grouped.set(transfer.source,members);
 }
 const sources=[...grouped.entries()]
   .filter(([,members])=>members.size>=2)
   .map(([source,members])=>({
      source,recipientCount:members.size,recipients:[...members].sort()
   }))
   .sort((a,b)=>b.recipientCount-a.recipientCount);
 return {
   mint,launchUnixSeconds,scannedWallets:wallets.length,
   recentTransactionsInspected:transactions.length,
   qualifyingTransfers:transfers,commonFundingSources:sources,
   possibleSharedFunding:sources.length>0,commonControlProven:false,
   status:sources.length?"partial_with_link_signal":"partial_no_link_detected",
   limitations:[
     "Only a small sample of recent wallet history was inspected; no link found does not establish independence.",
     "Shared sender can be an exchange, bridge, custody hot wallet, or ordinary service.",
     "Funding transfer alone does not establish that recipients bought this token or share beneficial ownership.",
     "This is not a complete first-block buyer graph and cannot authorize options trading."
   ]
 };
}
type SignatureInfo={signature:string;blockTime?:number|null;err?:unknown};
type RpcValue={result?:unknown;error?:{code?:number}};
export async function fetchFundingLinks(
 endpoint:string,mint:string,launchUnixSeconds:number,wallets:string[],
 fetcher:typeof fetch=fetch
):Promise<FundingLinkReport>{
 if(!endpoint.startsWith("https://")||wallets.length===0||wallets.length>4||
    wallets.some(w=>!validKey(w)))throw new Error("invalid_funding_rpc_request");
 async function rpc<T>(method:string,params:unknown[]):Promise<T>{
   const response=await fetcher(endpoint,{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
     signal:AbortSignal.timeout(12000)
   });
   if(response.status===429)throw new Error("FUNDING_RPC_RATE_LIMIT");
   if(!response.ok)throw new Error("FUNDING_RPC_HTTP_"+response.status);
   const json=await response.json() as RpcValue;
   if(json.error||json.result===undefined)
     throw new Error("FUNDING_RPC_ERROR_"+String(json.error?.code??"missing"));
   return json.result as T;
 }
 const matches:Array<{wallet:string;signature:string;tx:Transaction|null}>=[];
 for(const wallet of wallets){
   const signatures=await rpc<SignatureInfo[]>("getSignaturesForAddress",[
     wallet,{limit:3,commitment:"confirmed"}
   ]);
   if(!Array.isArray(signatures)||signatures.length>3)
     throw new Error("invalid_funding_history");
   for(const item of signatures){
     if(typeof item.signature!=="string"||item.err)continue;
     const tx=await rpc<Transaction|null>("getTransaction",[item.signature,{
       encoding:"jsonParsed",commitment:"confirmed",maxSupportedTransactionVersion:1
     }]);
     matches.push({wallet,signature:item.signature,tx});
   }
 }
 return inferFundingLinks(mint,launchUnixSeconds,wallets,matches);
}
