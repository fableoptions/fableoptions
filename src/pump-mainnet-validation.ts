/**
 * Read-only mainnet sampler. Does not access funds or write to Fable DB.
 * Run with SOLANA_RPC_URL or HELIUS_API_KEY from a machine with RPC access.
 * Results are observational; N sampled program transactions are not an
 * exhaustive population of Pump.fun launches.
 */
import { decodeLaunches,type ParsedTx } from "./pump-decode.js";
import { verifyPumpTransaction } from "./pump-verification.js";
import { fetchRecentPumpSignatures } from "./pump-reconciliation.js";
const key=process.env.HELIUS_API_KEY;
const rpcUrl=process.env.SOLANA_RPC_URL ?? (key
 ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`
 : "https://api.mainnet-beta.solana.com");
if(!rpcUrl.startsWith("https://"))throw new Error("HTTPS RPC required");
const limit=Number(process.env.VERIFY_SAMPLE_LIMIT ?? 12);
if(!Number.isInteger(limit)||limit<1||limit>30)throw new Error("VERIFY_SAMPLE_LIMIT must be 1..30");
async function rpc(method:string,params:unknown[]):Promise<unknown>{
 const result=await fetch(rpcUrl,{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(20000)
 });
 if(!result.ok)throw new Error("RPC HTTP "+result.status);
 const json=await result.json() as {result?:unknown;error?:{code?:number}};
 if(json.error)throw new Error("RPC error "+String(json.error.code));
 return json.result;
}
const signatures=await fetchRecentPumpSignatures(rpcUrl,limit);
const knownSignature=process.env.VERIFY_KNOWN_SIGNATURE??"";
const knownMint=process.env.VERIFY_KNOWN_MINT??"";
if(Boolean(knownSignature)!==Boolean(knownMint))throw new Error("Both known signature and mint are required");
let fetched=0,failed=0,decoded=0,matched=0,excluded=0;
let knownSignatureMatched=false;
const examples:Array<{signature:string;slot:number;mints:string[];accountConsistent:boolean}>=[];
const targets=[...signatures];
if(knownSignature && !targets.some(x=>x.signature===knownSignature))targets.push({signature:knownSignature,slot:0,err:null});
for(const sig of targets){
 if(sig.err!==null)continue;
 try{
   const tx=await rpc("getTransaction",[sig.signature,{
     encoding:"jsonParsed",commitment:"confirmed",maxSupportedTransactionVersion:1
   }]) as ParsedTx | null;
   if(!tx){failed++;continue;}
   fetched++;
   const launches=decodeLaunches(tx),check=verifyPumpTransaction(tx);
   decoded+=launches.length;matched+=check.verifiedLaunches.length;excluded+=check.excludedLaunches.length;
   if(sig.signature===knownSignature)knownSignatureMatched=check.verifiedLaunches.some(x=>x.mint===knownMint);
   if(launches.length)examples.push({
     signature:sig.signature,slot:sig.slot,mints:check.verifiedLaunches.map(x=>x.mint),
     accountConsistent:check.completelyVerified
   });
 }catch(error){failed++;process.stderr.write("[fable] sample tx unavailable: "+String(error)+"\\n");}
 await new Promise(r=>setTimeout(r,1250));
}
const report={
 observedAt:new Date().toISOString(),
 sampledProgramTransactions:signatures.length,
 fetchedTransactions:fetched,failedFetches:failed,
 decodedLaunchInstructions:decoded,accountMatchedLaunches:matched,
 excludedLaunches:excluded,
 examples:examples.slice(0,8),
 knownSignatureMatched:knownSignature ? knownSignatureMatched : null,
 validationPassed:knownSignature ? knownSignatureMatched && excluded===0 : matched>0&&excluded===0,
 completenessVerified:false,
 note:"Sampling successful program transactions does not measure recall or false negatives across all Pump.fun launches."
};
process.stdout.write(JSON.stringify(report,null,2)+"\\n");
if(!report.validationPassed)process.exitCode=2;
