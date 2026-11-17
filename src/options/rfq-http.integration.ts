/**
 * End-to-end API test against throwaway PostgreSQL.
 * All identities are generated in memory; no live assets, keys or RPC calls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import bs58 from "bs58";
import { signingMessage } from "./wallet-auth.js";
import type { RfqRequest, WriterQuote } from "./rfq.js";

function wallet() {
  const pair=generateKeyPairSync("ed25519");
  const der=pair.publicKey.export({format:"der",type:"spki"}) as Buffer;
  const address=bs58.encode(der.subarray(-32));
  return {address,privateKey:pair.privateKey};
}
const buyer=wallet(), writer=wallet();
const baseUrl="http://127.0.0.1:37543";
async function req(path:string,method="GET",data?:unknown) {
  const response=await fetch(baseUrl+path,{
    method, headers:{"content-type":"application/json"},
    body:data===undefined?undefined:JSON.stringify(data),
    signal:AbortSignal.timeout(5000)
  });
  return {status:response.status,body:await response.json() as Record<string,unknown>};
}
function signedPayload(identity:ReturnType<typeof wallet>,action:"request"|"quote",nonce:string,payload:object) {
  const message=signingMessage(identity.address,nonce,action,payload);
  return {payload,nonce,signature:bs58.encode(sign(null,Buffer.from(message,"utf8"),identity.privateKey))};
}

test("wallet-authenticated RFQ request and quote survive in DB; replay and invalid signature fail", {timeout:30000}, async(t)=>{
  if(!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL required for isolated PostgreSQL integration test");
    return;
  }
  const child=spawn(process.execPath,["--import","tsx","src/options/rfq-api.ts"],{
    env:{...process.env,PORT:"37543",RFQ_API_ENABLED:"true"},stdio:["ignore","pipe","pipe"]
  });
  let logs="";
  child.stderr?.on("data",chunk=>{logs+=String(chunk);});
  try {
    let healthy=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw new Error("RFQ service exited: "+logs);
      try{
        const health=await req("/health");
        if(health.status===200) {healthy=true;break;}
      } catch{}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(healthy,"RFQ service did not start: "+logs);
    const t0=Date.now();
    const rfq: RfqRequest = {
      id:"ci-"+String(t0)+"-"+Math.random().toString(36).slice(2,8),
      buyerWallet:buyer.address,underlyingMint:"So11111111111111111111111111111111111111112",
      side:"call",strikePriceUsd:1,expiresAt:new Date(t0+3600000).toISOString(),
      notionalUnits:100,maximumPremiumUsd:25,
      createdAt:new Date(t0).toISOString(),requestExpiresAt:new Date(t0+300000).toISOString()
    };
    const challenge=await req("/v1/rfq/challenge","POST",{wallet:buyer.address,action:"request"});
    assert.equal(challenge.status,200);
    const nonce=challenge.body.nonce as string;
    const valid=signedPayload(buyer,"request",nonce,rfq);
    assert.equal((await req("/v1/rfq/requests","POST",valid)).status,201);
    assert.equal((await req("/v1/rfq/requests","POST",valid)).status,409,"signature replay must fail");
    const requests=await req("/v1/rfq/requests");
    assert.equal(requests.status,200);
    assert.equal(requests.body.quotesExecutable,false);
    assert.ok((requests.body.data as Array<{id:string}>).some(x=>x.id===rfq.id));
    const quote:WriterQuote={
      id:rfq.id+"-quote",rfqId:rfq.id,writerWallet:writer.address,
      premiumUsd:15,payoutCapUsd:50,collateralUsd:50,
      quotedAt:new Date().toISOString(),validUntil:new Date(Date.now()+50000).toISOString(),
      status:"indicative"
    };
    const writerChallenge=await req("/v1/rfq/challenge","POST",{wallet:writer.address,action:"quote"});
    assert.equal(writerChallenge.status,200);
    const quoteNonce=writerChallenge.body.nonce as string;
    const quoteSignature=signedPayload(writer,"quote",quoteNonce,quote);
    const forged={...quoteSignature,payload:{...quote,premiumUsd:10}};
    assert.equal((await req("/v1/rfq/quotes","POST",forged)).status,401);
    assert.equal((await req("/v1/rfq/quotes","POST",quoteSignature)).status,201);
    assert.equal((await req("/v1/rfq/quotes","POST",quoteSignature)).status,409);
    const quotes=await req("/v1/rfq/quotes?rfqId="+encodeURIComponent(rfq.id));
    assert.equal(quotes.status,200);
    assert.equal(quotes.body.collateralVerified,false);
    assert.ok((quotes.body.data as Array<{id:string}>).some(x=>x.id===quote.id));
  } finally {
    child.kill("SIGTERM");
    if(child.exitCode===null) await Promise.race([once(child,"exit"),new Promise(r=>setTimeout(r,1500))]);
  }
});
