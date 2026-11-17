/**
 * Read-only finalized SPL USDC token account inspection.
 *
 * Checks a particular account and expected token authority, NOT whether
 * a deployed options program can irrevocably hold or release collateral.
 * A sufficiently funded wallet is NOT a funded option escrow.
 */
import bs58 from "bs58";
import {SOLANA_USDC_MINT,USDC_DECIMALS} from "./usdc-settlement-model.js";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
function pubkey(s:string):boolean{
 try{return bs58.decode(s).length===32;}catch{return false;}
}
type Account={
 owner?:string;executable?:boolean;
 data?:{program?:string;parsed?:{type?:string;info?:{
  mint?:string;owner?:string;state?:string;
  delegate?:string|null;delegatedAmount?:{amount?:string};
  closeAuthority?:string|null;
  tokenAmount?:{amount?:string;decimals?:number}
 }}};
};
export type EscrowAccountInspection={
 account:string;observedSlot:number;
 expectedAuthority:string;
 actualAuthority:string|null;
 balanceMicroUsdc:string|null;
 requiredMicroUsdc:string;
 accountMintIsNativeUsdc:boolean;
 authorityMatches:boolean;
 sufficientBalance:boolean;
 tokenAccountInitialized:boolean;
 noDelegate:boolean;
 noCloseAuthority:boolean;
 evidenceConsistent:boolean;
 verifiedProgramControlledEscrow:false;
 fundsLockedForOption:false;
 realSettlementApproved:false;
 reasons:string[];
};
export function inspectUsdcTokenAccount(
 address:string,expectedAuthority:string,requiredMicroUsdc:string,
 account:Account|null,observedSlot:number
):EscrowAccountInspection {
 if(!pubkey(address)||!pubkey(expectedAuthority)||
   !/^(0|[1-9][0-9]*)$/.test(requiredMicroUsdc)||
   requiredMicroUsdc.length>35||!Number.isSafeInteger(observedSlot)||observedSlot<=0)
   throw new Error("invalid_escrow_inspection_input");
 const info=account?.data?.parsed?.info;
 const actual=typeof info?.owner==="string"?info.owner:null;
 const amount=info?.tokenAmount?.amount;
 const numeric=typeof amount==="string"&&/^(0|[1-9][0-9]*)$/.test(amount)
   ?BigInt(amount):null;
 const reasons:string[]=[];
 const nativeMint=info?.mint===SOLANA_USDC_MINT&&
  account?.owner===TOKEN_PROGRAM&&account?.data?.program==="spl-token"&&
  account?.data?.parsed?.type==="account"&&info?.tokenAmount?.decimals===USDC_DECIMALS;
 if(!nativeMint)reasons.push("NOT_CIRCLE_NATIVE_SOLANA_USDC");
 const initialized=info?.state==="initialized";
 if(!initialized)reasons.push("TOKEN_ACCOUNT_NOT_INITIALIZED");
 const authorityMatches=actual===expectedAuthority;
 if(!authorityMatches)reasons.push("TOKEN_AUTHORITY_MISMATCH");
 const sufficient=numeric!==null&&numeric>=BigInt(requiredMicroUsdc);
 if(!sufficient)reasons.push("INSUFFICIENT_USDC_BALANCE");
 const noDelegate=info!==undefined&&
   (info.delegate===undefined||info.delegate===null)&&
   (info.delegatedAmount===undefined||info.delegatedAmount.amount==="0");
 if(!noDelegate)reasons.push("TOKEN_ACCOUNT_DELEGATE_PRESENT_OR_UNKNOWN");
 const noClose=info!==undefined&&
   (info.closeAuthority===undefined||info.closeAuthority===null);
 if(!noClose)reasons.push("TOKEN_CLOSE_AUTHORITY_PRESENT");
 if(account?.executable===true)reasons.push("INVALID_EXECUTABLE_ACCOUNT");
 return {
  account:address,observedSlot,expectedAuthority,
  actualAuthority:actual,balanceMicroUsdc:numeric?.toString()??null,
  requiredMicroUsdc,accountMintIsNativeUsdc:nativeMint,
  authorityMatches,sufficientBalance:sufficient,tokenAccountInitialized:initialized,
  noDelegate,noCloseAuthority:noClose,
  evidenceConsistent:reasons.length===0,
  verifiedProgramControlledEscrow:false,fundsLockedForOption:false,
  realSettlementApproved:false,reasons
 };
}
export async function fetchUsdcAccountInspection(
 rpcUrl:string,address:string,expectedAuthority:string,requiredMicroUsdc:string,
 fetcher:typeof fetch=fetch
):Promise<EscrowAccountInspection>{
 if(!rpcUrl.startsWith("https://")||!pubkey(address)||!pubkey(expectedAuthority))
   throw new Error("invalid_escrow_rpc");
 const response=await fetcher(rpcUrl,{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getAccountInfo",
   params:[address,{encoding:"jsonParsed",commitment:"finalized"}]}),
  signal:AbortSignal.timeout(12000)
 });
 if(response.status===429)throw new Error("ESCROW_RPC_RATE_LIMIT");
 if(!response.ok)throw new Error("ESCROW_RPC_HTTP_"+response.status);
 const result=await response.json() as {
   result?:{context?:{slot?:number};value?:Account|null};error?:{code?:number}
 };
 if(result.error||!Number.isSafeInteger(result.result?.context?.slot))
   throw new Error("ESCROW_RPC_INVALID_RESPONSE");
 return inspectUsdcTokenAccount(address,expectedAuthority,requiredMicroUsdc,
   result.result?.value??null,result.result!.context!.slot!);
}
