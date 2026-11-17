import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import bs58 from "bs58";
import { decodeLaunches, PUMP_PROGRAM_ID } from "./pump-decode.js";
const str = (s: string) => { const b=Buffer.from(s); const n=Buffer.alloc(4); n.writeUInt32LE(b.length); return Buffer.concat([n,b]); };
test("decodes official create_v2 discriminator and first mint account",()=>{
  const data=Buffer.concat([createHash("sha256").update("global:create_v2").digest().subarray(0,8),str("Fable Test"),str("FT"),str("https://example.com/metadata")]);
  const tx={slot:123,meta:{err:null},transaction:{signatures:["sig"],message:{instructions:[{programId:PUMP_PROGRAM_ID,accounts:["mint123"],data:bs58.encode(data)}]}}};
  assert.deepEqual(decodeLaunches(tx),[{signature:"sig",slot:123,mint:"mint123",name:"Fable Test",symbol:"FT",uri:"https://example.com/metadata",instruction:"create_v2"}]);
});
test("ignores failed transactions",()=>assert.deepEqual(decodeLaunches({slot:1,meta:{err:{InstructionError:[0,"Failed"]}},transaction:{signatures:["sig"]}}),[]));
