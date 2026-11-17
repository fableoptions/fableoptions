/**
 * Read-only SPL/Token-2022 ownership snapshot using standard Solana RPC.
 * Largest TOKEN ACCOUNTS are not necessarily beneficial owners: AMM pools,
 * vaults, token custody and delegates require independent classification.
 *
 * No creator-wallet link, coordinated launch, fraud, or supply safety is
 * inferred from this snapshot. Only raw, reproducible signals are returned.
 */
import bs58 from "bs58";
const validKey=(x:unknown):x is string=>{
  if(typeof x!=="string"||x.length<32||x.length>44)return false;
  try{return bs58.decode(x).length===32;}catch{return false;}
};
type Amount={amount:string;decimals?:number};
type Largest={address:string;amount:string};
type ParsedAccount={data?:{parsed?:{info?:{owner?:string;mint?:string;tokenAmount?:Amount}}}};
type ParsedMint={data?:{parsed?:{info?:{mintAuthority?:string|null;freezeAuthority?:string|null; supply?:string}}}};
export type OwnershipAudit={
  mint:string;observedAt:string;contextSlot:number;
  supplyAtomic:string;
  topTokenAccountPct:number|null;topTenTokenAccountsPct:number|null;
  topTwentyAccountsCount:number;
  distinctVisibleOwners:number|null;
  repeatedOwnerAccountCount:number|null;
  mintAuthorityRevoked:boolean|null;freezeAuthorityRevoked:boolean|null;
  holderAccountsClassified:false;walletClustersVerified:false;
  bundleEvidence:"unknown";
  riskSignals:string[];
  coverage:{
    largestAccountsCap:20;allHoldersEnumerated:false;
    vaultsExcluded:false;creatorFundingTraced:false;
    sameSlotBuysReconstructed:false;
  };
};
function parseAmount(s:unknown):bigint|null {
 if(typeof s!=="string"||!/^(0|[1-9][0-9]*)$/.test(s)||s.length>40)return null;
 try{return BigInt(s);}catch{return null;}
}
function pct(n:bigint,d:bigint):number {
 // Integer arithmetic preserves precision of high-supply SPL tokens.
 return Number(n*1_000_000n/d)/10_000;
}
export function interpretOwnershipSnapshot(
 mint:string,supplyValue:Amount,largest:Largest[],
 accounts:Array<ParsedAccount|null>,mintAccount:ParsedMint|null,
 observedAt=new Date(),slot=1
):OwnershipAudit {
 if(!validKey(mint)||!Number.isSafeInteger(slot)||slot<=0||
    largest.length>20||largest.length!==accounts.length)
   throw new Error("invalid_ownership_response");
 const supply=parseAmount(supplyValue.amount);
 if(supply===null||supply===0n)throw new Error("invalid_token_supply");
 let holderSum=0n;
 const amounts=largest.map(item=>{
   if(!validKey(item.address))throw new Error("invalid_token_account");
   const amount=parseAmount(item.amount);
   if(amount===null)throw new Error("invalid_holder_amount");
   holderSum+=amount;
   return amount;
 });
 if(holderSum> supply)throw new Error("inconsistent_holder_supply");
 const ownerKeys:string[]=[];
 let allParsed=true;
 for(let i=0;i<accounts.length;i++){
   const info=accounts[i]?.data?.parsed?.info;
   if(!info||info.mint!==mint||!validKey(info.owner)){
     allParsed=false;continue;
   }
   if(info.tokenAmount?.amount!==undefined){
     const parsed=parseAmount(info.tokenAmount.amount);
     if(parsed===null||parsed!==amounts[i]){allParsed=false;continue;}
   }
   ownerKeys.push(info.owner);
 }
 const first=amounts[0]??0n,topTen=amounts.slice(0,10).reduce((a,b)=>a+b,0n);
 const owners=allParsed?new Set(ownerKeys):null;
 const topPct=largest.length?pct(first,supply):null;
 const topTenPct=largest.length?pct(topTen,supply):null;
 const flags:string[]=[];
 if(topPct!==null&&topPct>15)flags.push("TOP_TOKEN_ACCOUNT_EXCEEDS_15_PCT_UNCLASSIFIED");
 if(topTenPct!==null&&topTenPct>50)flags.push("TOP_TEN_TOKEN_ACCOUNTS_EXCEED_50_PCT_UNCLASSIFIED");
 if(owners&&owners.size<ownerKeys.length)
   flags.push("SOME_TOP_TOKEN_ACCOUNTS_SHARE_SAME_DECLARED_OWNER");
 const info=mintAccount?.data?.parsed?.info;
 const mintAuthorityRevoked=info&&"mintAuthority" in info
   ? info.mintAuthority===null:null;
 const freezeAuthorityRevoked=info&&"freezeAuthority" in info
   ? info.freezeAuthority===null:null;
 if(mintAuthorityRevoked===false)flags.push("MINT_AUTHORITY_PRESENT");
 if(freezeAuthorityRevoked===false)flags.push("FREEZE_AUTHORITY_PRESENT");
 if(!allParsed)flags.push("SOME_TOKEN_ACCOUNT_OWNERS_UNPARSED");
 flags.push("BENEFICIAL_OWNERS_AND_POOL_ACCOUNTS_NOT_CLASSIFIED");
 return {
   mint,observedAt:observedAt.toISOString(),contextSlot:slot,
   supplyAtomic:supply.toString(),
   topTokenAccountPct:topPct,topTenTokenAccountsPct:topTenPct,
   topTwentyAccountsCount:amounts.length,
   distinctVisibleOwners:owners?.size??null,
   repeatedOwnerAccountCount:owners?ownerKeys.length-owners.size:null,
   mintAuthorityRevoked,freezeAuthorityRevoked,
   holderAccountsClassified:false,walletClustersVerified:false,
   bundleEvidence:"unknown",riskSignals:flags,
   coverage:{largestAccountsCap:20,allHoldersEnumerated:false,
     vaultsExcluded:false,creatorFundingTraced:false,sameSlotBuysReconstructed:false}
 };
}
export async function fetchOwnershipAudit(
 endpoint:string,mint:string,fetcher:typeof fetch=fetch
):Promise<OwnershipAudit>{
 if(!endpoint.startsWith("https://")||!validKey(mint))throw new Error("invalid_rpc_or_mint");
 async function rpc<T>(method:string,params:unknown[]):Promise<T>{
   const response=await fetcher(endpoint,{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
     signal:AbortSignal.timeout(16000)
   });
   if(response.status===429)throw new Error("OWNERSHIP_RPC_RATE_LIMIT");
   if(!response.ok)throw new Error("OWNERSHIP_RPC_HTTP_"+response.status);
   const body=await response.json() as {result?:T;error?:{code?:number}};
   if(body.error||!body.result)throw new Error("OWNERSHIP_RPC_ERROR_"+String(body.error?.code??"missing"));
   return body.result;
 }
 const supply=await rpc<{context:{slot:number};value:Amount}>("getTokenSupply",
   [mint,{commitment:"confirmed"}]);
 const largest=await rpc<{context:{slot:number};value:Largest[]}>(
   "getTokenLargestAccounts",[mint,{commitment:"confirmed"}]);
 if(!Array.isArray(largest.value)||largest.value.length>20||
    !supply.value||!Number.isSafeInteger(largest.context?.slot))throw new Error("invalid_ownership_rpc");
 const addresses=[mint,...largest.value.map(x=>x.address)];
 const parsed=await rpc<{context:{slot:number};value:Array<ParsedAccount|ParsedMint|null>}>(
   "getMultipleAccounts",[addresses,{encoding:"jsonParsed",commitment:"confirmed"}]);
 if(!Array.isArray(parsed.value)||parsed.value.length!==addresses.length)
   throw new Error("invalid_ownership_rpc_accounts");
 // A widely separated supply snapshot could invent concentration.
 const slots=[supply.context?.slot,largest.context?.slot,parsed.context?.slot];
 if(slots.some(x=>!Number.isSafeInteger(x)||x!<=0)||
    Math.max(...slots)-Math.min(...slots)>150)throw new Error("ownership_snapshot_slot_drift");
 return interpretOwnershipSnapshot(
   mint,supply.value,largest.value,parsed.value.slice(1) as Array<ParsedAccount|null>,
   parsed.value[0] as ParsedMint|null,new Date(),Math.max(...slots)
 );
}
