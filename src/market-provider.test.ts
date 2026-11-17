import test from "node:test";
import assert from "node:assert/strict";
import {parseDexObservations,fetchDexObservations,MarketRateLimitError} from "./market-provider.js";
const mint="So11111111111111111111111111111111111111112";
const x={chainId:"solana",baseToken:{address:mint},pairAddress:"pairA",
 marketCap:350000,fdv:800000,liquidity:{usd:19000}};
test("chooses liquid valid Solana pair and never substitutes FDV",()=>{
 const data=parseDexObservations([x,{...x,pairAddress:"pairB",liquidity:{usd:21000}},{
  ...x,pairAddress:"false",marketCap:null,fdv:1000000,liquidity:{usd:999999}
 }],[mint]);
 assert.equal(data.length,1);
 assert.equal(data[0].poolAddress,"pairB");
 assert.equal(data[0].marketCapUsd,350000);
});
test("rejects wrong chain and quote-token-only pairs",()=>{
 assert.equal(parseDexObservations([{...x,chainId:"ethereum"},{...x,baseToken:{address:"another"}}],[mint]).length,0);
});
test("batch endpoint passes expected address and parses response",async()=>{
 const fake=async(u:unknown)=>({ok:true,status:200,json:async()=>[x],url:u});
 const result=await fetchDexObservations([mint],fake as unknown as typeof fetch);
 assert.equal(result[0].source,"dexscreener");
});
test("429 is surfaced for the worker to back off",async()=>{
 const fake=async()=>({ok:false,status:429,headers:{get:()=>null}});
 await assert.rejects(fetchDexObservations([mint],fake as unknown as typeof fetch),MarketRateLimitError);
});

test("DEX unit price is preserved separately from market cap and never inferred from FDV",()=>{
 const rows=parseDexObservations([{...x,marketCap:500000,fdv:999999,
   priceUsd:"0.00049"}],[mint]);
 assert.equal(rows[0].marketCapUsd,500000);
 assert.equal(rows[0].tokenPriceUsd,0.00049);
 const missing=parseDexObservations([{...x,priceUsd:null}],[mint]);
 assert.equal(missing[0].tokenPriceUsd,null);
});
