import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import bs58 from "bs58";
import {verifyPumpTransaction} from "./pump-verification.js";
import {PUMP_PROGRAM_ID} from "./pump-decode.js";
const str=(s:string)=>{const b=Buffer.from(s);const prefix=Buffer.alloc(4);prefix.writeUInt32LE(b.length);return Buffer.concat([prefix,b]);};
const mint=bs58.encode(Buffer.alloc(32,37));
const bytes=Buffer.concat([createHash("sha256").update("global:create_v2").digest().subarray(0,8),
  str("Verified Token"),str("VFT"),str("https://example.com/m.json")]);
function tx(keys: string[]) {
  return {slot:1234,meta:{err:null},transaction:{
    signatures:["example-sig"],message:{
      accountKeys:keys.map(pubkey=>({pubkey})),
      instructions:[{programId:PUMP_PROGRAM_ID,accounts:[mint],data:bs58.encode(bytes)}]
    }
  }};
}
test("valid create_v2 mint must exist in canonical transaction accounts",()=>{
  const result=verifyPumpTransaction(tx([mint,PUMP_PROGRAM_ID]));
  assert.equal(result.completelyVerified,true);
  assert.equal(result.verifiedLaunches[0].mint,mint);
  assert.equal(result.excludedLaunches.length,0);
  assert.ok(result.limitations.some(x=>x.includes("Does not")));
});
test("rejects mint not present in actual transaction message keys",()=>{
  const result=verifyPumpTransaction(tx([PUMP_PROGRAM_ID]));
  assert.equal(result.completelyVerified,false);
  assert.equal(result.verifiedLaunches.length,0);
  assert.equal(result.excludedLaunches[0].reason,"mint_not_in_canonical_tx_keys");
});
test("rejects missing message account keys",()=>{
  const result=verifyPumpTransaction(tx([]));
  assert.equal(result.completelyVerified,false);
  assert.equal(result.excludedLaunches[0].reason,"missing_transaction_account_keys");
});
