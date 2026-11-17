/**
 * Read-only SOL-quoted Pump.fun bonding curve snapshots.
 *
 * Source: pump-fun/pump-public-docs/idl/pump.json BondingCurve layout.
 * This is an indicative SOL/USD market-cap estimate, NOT a settlement oracle.
 * Mayhem-mode, non-SOL quote mints and completed curves are rejected.
 */
import { PublicKey } from "@solana/web3.js";
import { PUMP_PROGRAM_ID } from "./pump-decode.js";

const PUMP_PROGRAM=new PublicKey(PUMP_PROGRAM_ID);
const DISCRIMINATOR=Buffer.from([23,183,248,55,96,216,172,96]);
const LAMPORTS_PER_SOL=1_000_000_000;
const ZERO_PUBKEY=Buffer.alloc(32);
const SOL_QUOTE_ID="11111111111111111111111111111111";

export type CurveSnapshot = {
  mint:string; bondingCurve:string; observedAt:Date;
  marketCapUsd:number; poolLiquidityUsd:null;
  reserveSol:number; source:"pump_bonding_curve_solana";
  isMayhemMode:false; quoteAsset:"SOL"; settlementOracle:false;
  contextSlot:number;
};
type AccountInfo = {owner:string; data:[string,string]} | null;

export function pumpCurveAddress(mint:string):string {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"),new PublicKey(mint).toBuffer()],PUMP_PROGRAM
  )[0].toBase58();
}

export type CurveState = {
  virtualTokenReserves:bigint;virtualSolReserves:bigint;
  realTokenReserves:bigint;realSolReserves:bigint;
  totalSupply:bigint;complete:boolean;isMayhemMode:boolean;
  quoteMint:string;
};
export function decodePumpCurve(bytes:Buffer,owner:string):CurveState|null {
  // Fields and offsets are based on current official Pump IDL; fail closed
  // rather than trying to interpret arbitrary program or legacy data.
  if(owner!==PUMP_PROGRAM_ID||bytes.length<115||!bytes.subarray(0,8).equals(DISCRIMINATOR))return null;
  const complete=bytes[48],mayhem=bytes[81];
  if(complete>1||mayhem>1)return null;
  const quote=bytes.subarray(83,115);
  const reserve={
    virtualTokenReserves:bytes.readBigUInt64LE(8),
    virtualSolReserves:bytes.readBigUInt64LE(16),
    realTokenReserves:bytes.readBigUInt64LE(24),
    realSolReserves:bytes.readBigUInt64LE(32),
    totalSupply:bytes.readBigUInt64LE(40),
    complete:complete===1,
    isMayhemMode:mayhem===1,
    quoteMint:new PublicKey(quote).toBase58()
  };
  if(!quote.equals(ZERO_PUBKEY)||reserve.complete||reserve.isMayhemMode||
     reserve.virtualTokenReserves===0n||reserve.virtualSolReserves===0n||
     reserve.totalSupply===0n)return null;
  return reserve;
}

export function estimateCurveMarketCapUsd(state:CurveState,solUsd:number):number|null {
  if(state.quoteMint!==SOL_QUOTE_ID||state.isMayhemMode||state.complete||
     !(Number.isFinite(solUsd)&&solUsd>0&&solUsd<100000))return null;
  const capSol=Number(state.virtualSolReserves)/Number(state.virtualTokenReserves)*
    Number(state.totalSupply)/LAMPORTS_PER_SOL;
  const capUsd=capSol*solUsd;
  // Reject unusual/implausible values until independently reconciled.
  return Number.isFinite(capUsd)&&capUsd>0&&capUsd<1e11?capUsd:null;
}

export async function fetchSolUsd(fetcher:typeof fetch=fetch):Promise<number|null>{
  const res=await fetcher("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",{
    headers:{accept:"application/json"},signal:AbortSignal.timeout(11000)
  });
  if(!res.ok)return null;
  const data=await res.json() as {solana?:{usd?:unknown}};
  const price=data?.solana?.usd;
  return typeof price==="number"&&Number.isFinite(price)&&price>0&&price<100000?price:null;
}

export async function fetchPumpCurveSnapshots(
  rpcUrl:string,mints:string[],solUsd:number,fetcher:typeof fetch=fetch
):Promise<CurveSnapshot[]> {
  if(!rpcUrl.startsWith("https://"))throw new Error("secure_rpc_required");
  if(mints.length===0)return [];
  if(mints.length>30)throw new Error("maximum_curve_batch_30");
  const addresses=mints.map(pumpCurveAddress);
  const res=await fetcher(rpcUrl,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getMultipleAccounts",
      params:[addresses,{encoding:"base64",commitment:"confirmed"}]}),
    signal:AbortSignal.timeout(18000)
  });
  if(res.status===429)throw new Error("PUMP_CURVE_RPC_RATE_LIMIT");
  if(!res.ok)throw new Error("PUMP_CURVE_RPC_HTTP_"+res.status);
  const payload=await res.json() as {
    result?:{context?:{slot?:number};value?:AccountInfo[]};
    error?:{code?:number};
  };
  if(payload.error)throw new Error("PUMP_CURVE_RPC_"+String(payload.error.code??"unknown"));
  const slot=payload.result?.context?.slot??0;
  const accounts=payload.result?.value;
  if(!Number.isSafeInteger(slot)||slot<=0||!Array.isArray(accounts)||
     accounts.length!==mints.length)throw new Error("invalid_curve_rpc_response");
  const sampledAt=new Date();
  const out:CurveSnapshot[]=[];
  for(let i=0;i<accounts.length;i++){
    const account=accounts[i];
    if(!account||!Array.isArray(account.data)||account.data[1]!=="base64")continue;
    const decoded=decodePumpCurve(Buffer.from(account.data[0],"base64"),account.owner);
    if(!decoded)continue;
    const cap=estimateCurveMarketCapUsd(decoded,solUsd);
    if(cap===null)continue;
    out.push({
      mint:mints[i],bondingCurve:addresses[i],observedAt:sampledAt,
      marketCapUsd:cap,poolLiquidityUsd:null,
      reserveSol:Number(decoded.realSolReserves)/LAMPORTS_PER_SOL,
      source:"pump_bonding_curve_solana",quoteAsset:"SOL",
      isMayhemMode:false,settlementOracle:false,contextSlot:slot
    });
  }
  return out;
}
