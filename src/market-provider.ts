/** Batching reduces cost and makes missing market-cap values explicit.
 * DexScreener's marketCap is an external estimate, never a settlement oracle.
 * FDV is intentionally NOT substituted for marketCap.
 */
export interface DexPair {
  chainId?:string; pairAddress?:string; marketCap?:number|null; fdv?:number|null;
  baseToken?:{address?:string}; liquidity?:{usd?:number|null};
}
export type MarketObservation={
  mint:string;marketCapUsd:number;poolLiquidityUsd:number;poolAddress:string;
  observedAt:Date;source:"dexscreener";
};
export function parseDexObservations(pairs:DexPair[],mints:readonly string[],at=new Date()):MarketObservation[]{
  const desired=new Set(mints);
  const best=new Map<string,MarketObservation>();
  for(const pair of pairs){
    const mint=pair.baseToken?.address;
    if(pair.chainId!=="solana"||!mint||!desired.has(mint))continue;
    const cap=pair.marketCap,liquidity=pair.liquidity?.usd;
    if(typeof cap!=="number"||!Number.isFinite(cap)||cap<=0||
       typeof liquidity!=="number"||!Number.isFinite(liquidity)||liquidity<=0||
       !pair.pairAddress)continue;
    const old=best.get(mint);
    if(!old||liquidity>old.poolLiquidityUsd)best.set(mint,{
      mint,marketCapUsd:cap,poolLiquidityUsd:liquidity,
      poolAddress:pair.pairAddress,observedAt:at,source:"dexscreener"
    });
  }
  return [...best.values()];
}
export class MarketRateLimitError extends Error{
  constructor(readonly delayMs:number){super("market provider rate-limited");}
}
export async function fetchDexObservations(mints:string[],fetcher:typeof fetch=fetch):Promise<MarketObservation[]>{
  if(mints.length===0)return [];
  if(mints.length>30)throw new Error("maximum 30 mints per batch");
  if(mints.some(mint=>!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)))throw new Error("invalid mint");
  const res=await fetcher("https://api.dexscreener.com/tokens/v1/solana/"+mints.join(","),{
    headers:{accept:"application/json"},signal:AbortSignal.timeout(12000)
  });
  if(res.status===429){
    const header=Number(res.headers.get("retry-after"));
    throw new MarketRateLimitError(Number.isFinite(header)&&header>0?Math.max(60000,header*1000):120000);
  }
  if(!res.ok)throw new Error("DexScreener HTTP "+res.status);
  const body:unknown=await res.json();
  if(!Array.isArray(body))throw new Error("DexScreener malformed payload");
  return parseDexObservations(body as DexPair[],mints);
}
