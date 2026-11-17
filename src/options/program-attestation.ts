/**
 * Read-only attestation of Solana BPF-upgradeable program accounts.
 * A chain attestation alone does NOT certify an audit, verify escrow, or
 * authorize options execution. Every result is research evidence only.
 */
import bs58 from "bs58";

const BPF_UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const keyValid=(key:string):boolean=>{
  try{return bs58.decode(key).length===32;}catch{return false;}
};
export interface ProgramAccount {
  owner:string; executable:boolean; data:[string,string];
}
export type ProgramAttestation={
  programId:string; observedSlot:number;
  status:"unverified"|"program_account_matched"|"programdata_matched";
  programOwnedByUpgradeableLoader:boolean;
  executableFlag:boolean;
  programDataAddress:string|null;
  programDataVerified:boolean;
  lastUpgradeSlot:number|null;
  upgradeAuthority:string|null;
  immutable:boolean|null;
  auditReviewed:false;
  codeHashVerified:false;
  escrowVerified:false;
  settlementOracleVerified:false;
  tradingAuthorized:false;
  problems:string[];
};
type AccountResult={context?:{slot?:number};value?:ProgramAccount|null};
function fromBase64(a:ProgramAccount):Buffer{
  if(!Array.isArray(a.data)||a.data.length!==2||a.data[1]!=="base64"||
     !a.data[0]||a.data[0].length>50_000_000)throw new Error("unexpected_account_encoding");
  return Buffer.from(a.data[0],"base64");
}
export function parseUpgradeableProgram(
  programId:string,program:ProgramAccount|null,programData:ProgramAccount|null,
  observedSlot:number
):ProgramAttestation{
  if(!keyValid(programId)||!Number.isSafeInteger(observedSlot)||observedSlot<=0)
    throw new Error("invalid_program_attestation_input");
  const reasons:string[]=[];
  let address:string|null=null,authority:string|null=null,lastUpgradeSlot:number|null=null;
  let dataVerified=false,immutable:boolean|null=null;
  const owned=program?.owner===BPF_UPGRADEABLE_LOADER;
  const executable=program?.executable===true;
  if(!program)reasons.push("PROGRAM_ACCOUNT_NOT_FOUND");
  else{
    if(!owned)reasons.push("WRONG_PROGRAM_LOADER");
    if(!executable)reasons.push("PROGRAM_NOT_EXECUTABLE");
    if(owned){
      const raw=fromBase64(program);
      if(raw.length<36||raw.readUInt32LE(0)!==2)reasons.push("INVALID_PROGRAM_ACCOUNT_STATE");
      else address=bs58.encode(raw.subarray(4,36));
    }
  }
  if(!address)reasons.push("PROGRAMDATA_ADDRESS_NOT_VERIFIED");
  else if(!programData)reasons.push("PROGRAMDATA_ACCOUNT_NOT_FOUND");
  else if(programData.owner!==BPF_UPGRADEABLE_LOADER)
    reasons.push("PROGRAMDATA_WRONG_LOADER");
  else{
    const raw=fromBase64(programData);
    if(raw.length<13||raw.readUInt32LE(0)!==3)reasons.push("INVALID_PROGRAMDATA_STATE");
    else {
      const slot=raw.readBigUInt64LE(4);
      if(slot>BigInt(Number.MAX_SAFE_INTEGER))reasons.push("UPGRADE_SLOT_UNSAFE");
      else lastUpgradeSlot=Number(slot);
      const option=raw[12];
      if(option===0){immutable=true;dataVerified=true;}
      else if(option===1&&raw.length>=45){
        authority=bs58.encode(raw.subarray(13,45));immutable=false;dataVerified=true;
      }else reasons.push("INVALID_UPGRADE_AUTHORITY_LAYOUT");
    }
  }
  if(immutable===false)reasons.push("PROGRAM_UPGRADE_AUTHORITY_REQUIRES_REVIEW");
  return {
    programId,observedSlot,
    status:dataVerified&&owned&&executable?"programdata_matched":
      address&&owned&&executable?"program_account_matched":"unverified",
    programOwnedByUpgradeableLoader:owned,
    executableFlag:executable,programDataAddress:address,
    programDataVerified:dataVerified,lastUpgradeSlot,
    upgradeAuthority:authority,immutable,
    auditReviewed:false,codeHashVerified:false,escrowVerified:false,
    settlementOracleVerified:false,tradingAuthorized:false,
    problems:[...new Set(reasons)]
  };
}
export async function inspectProgramOnMainnet(
 rpcUrl:string,programId:string,fetcher:typeof fetch=fetch
):Promise<ProgramAttestation>{
 if(!rpcUrl.startsWith("https://")||!keyValid(programId))
   throw new Error("invalid_program_rpc_request");
 async function account(key:string):Promise<AccountResult>{
   const response=await fetcher(rpcUrl,{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getAccountInfo",
       params:[key,{encoding:"base64",commitment:"finalized"}]}),
     signal:AbortSignal.timeout(12000)
   });
   if(response.status===429)throw new Error("PROGRAM_RPC_RATE_LIMIT");
   if(!response.ok)throw new Error("PROGRAM_RPC_HTTP_"+response.status);
   const body=await response.json() as {result?:AccountResult;error?:{code?:number}};
   if(body.error||!body.result||!Number.isSafeInteger(body.result.context?.slot))
     throw new Error("PROGRAM_RPC_UNAVAILABLE");
   return body.result;
 }
 const first=await account(programId);
 let address:string|null=null;
 if(first.value?.owner===BPF_UPGRADEABLE_LOADER){
   try{
     const raw=fromBase64(first.value);
     if(raw.length>=36&&raw.readUInt32LE(0)===2)
       address=bs58.encode(raw.subarray(4,36));
   }catch{}
 }
 if(!address)return parseUpgradeableProgram(programId,first.value??null,null,first.context!.slot!);
 const second=await account(address);
 if(Math.abs(second.context!.slot!-first.context!.slot!)>150)
   throw new Error("PROGRAM_ATTESTATION_SLOT_DRIFT");
 return parseUpgradeableProgram(programId,first.value??null,second.value??null,
   Math.max(first.context!.slot!,second.context!.slot!));
}
