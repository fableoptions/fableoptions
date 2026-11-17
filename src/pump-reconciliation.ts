/**
 * Bounded reconciliation against Solana program-signature history.
 *
 * The RPC method lists ALL program interactions, not only creates. Sampling
 * only the first N signatures can miss launches on busy periods; any gap is
 * explicitly reported as incomplete rather than silently called recovered.
 */
import { PUMP_PROGRAM_ID } from "./pump-decode.js";
export type SignatureInfo = { signature:string; slot:number; err:unknown; blockTime?:number|null };
export type ReconciliationReport = {
  scanned:number; eligible:number; checkpointFound:boolean;
  gapDetected:boolean; newestSignature:string|null; oldestSignature:string|null;
  coverage:"bounded_only"|"checkpoint_reached"|"gap_unresolved";
};
export function assessReconciliation(
  page:SignatureInfo[], previousNewest:string|null, requestedLimit:number
):ReconciliationReport {
  if (!Number.isSafeInteger(requestedLimit)||requestedLimit<1||requestedLimit>100)
    throw new Error("invalid_recovery_limit");
  const checkpointFound=previousNewest!==null&&page.some(row=>row.signature===previousNewest);
  const gapDetected=previousNewest!==null&&!checkpointFound&&page.length>=requestedLimit;
  return {
    scanned:page.length,
    eligible:page.filter(row=>row.err===null).length,
    checkpointFound,gapDetected,
    newestSignature:page[0]?.signature??null,
    oldestSignature:page.at(-1)?.signature??null,
    coverage:gapDetected?"gap_unresolved":checkpointFound?"checkpoint_reached":"bounded_only"
  };
}
export async function fetchRecentPumpSignatures(
  endpoint:string,limit:number,fetcher:typeof fetch=fetch
):Promise<SignatureInfo[]> {
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error("invalid_recovery_limit");
  if(!endpoint.startsWith("https://"))throw new Error("https_rpc_required");
  const res=await fetcher(endpoint,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getSignaturesForAddress",
      params:[PUMP_PROGRAM_ID,{limit,commitment:"confirmed"}]}),
    signal:AbortSignal.timeout(16000)
  });
  if(res.status===429)throw new Error("RECOVERY_RPC_RATE_LIMIT");
  if(!res.ok)throw new Error("RECOVERY_RPC_HTTP_"+res.status);
  const json=await res.json() as {result?:SignatureInfo[];error?:{code?:number}};
  if(json.error)throw new Error("RECOVERY_RPC_"+String(json.error.code??"error"));
  if(!Array.isArray(json.result))throw new Error("RECOVERY_INVALID_RPC_RESULT");
  return json.result;
}
