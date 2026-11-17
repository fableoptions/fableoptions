/**
 * Independent validation of decoded Pump.fun creates against raw parsed
 * Solana transaction account keys and the deployed program's instruction.
 * The market sampling worker does not supply settlement-grade proof.
 */
import bs58 from "bs58";
import { decodeLaunches, PUMP_PROGRAM_ID, type ParsedTx } from "./pump-decode.js";
type Account = string | { pubkey:string; signer?:boolean; writable?:boolean };
type ParsedTxWithKeys = ParsedTx & {
  transaction?: ParsedTx["transaction"] & {
    message?: { instructions?: NonNullable<NonNullable<ParsedTx["transaction"]>["message"]>["instructions"]; accountKeys?:Account[] };
  };
};
const B58=/^[1-9A-HJ-NP-Za-km-z]+$/;
function canonicalKey(key:string):boolean{
  if(!B58.test(key))return false;
  try{return bs58.decode(key).length===32;}catch{return false;}
}
export type VerificationResult = {
  signature:string;
  verifiedLaunches:Array<{mint:string;instruction:string;name:string;symbol:string;verification:"instruction_and_message_key_match"}>;
  excludedLaunches:Array<{mint:string;reason:string}>;
  completelyVerified:boolean;
  limitations:string[];
};
export function verifyPumpTransaction(tx:ParsedTxWithKeys):VerificationResult {
  const signature=tx.transaction?.signatures?.[0]??"";
  const allInstructions=[...(tx.transaction?.message?.instructions??[]),
    ...(tx.meta?.innerInstructions??[]).flatMap(x=>x.instructions??[])];
  const keys=new Set((tx.transaction?.message?.accountKeys??[]).map(k=>typeof k==="string"?k:k.pubkey));
  const verifiedLaunches:VerificationResult["verifiedLaunches"]=[];
  const excludedLaunches:VerificationResult["excludedLaunches"]=[];
  for(const launch of decodeLaunches(tx)){
    const sourceInstruction=allInstructions.find(ix=>ix.programId===PUMP_PROGRAM_ID&&ix.accounts?.[0]===launch.mint);
    if(!canonicalKey(launch.mint)) {
      excludedLaunches.push({mint:launch.mint,reason:"noncanonical_mint"});continue;
    }
    if(keys.size===0) {
      excludedLaunches.push({mint:launch.mint,reason:"missing_transaction_account_keys"});continue;
    }
    if(!keys.has(launch.mint)||!sourceInstruction) {
      excludedLaunches.push({mint:launch.mint,reason:"mint_not_in_canonical_tx_keys"});continue;
    }
    verifiedLaunches.push({
      mint:launch.mint,instruction:launch.instruction,name:launch.name,symbol:launch.symbol,
      verification:"instruction_and_message_key_match"
    });
  }
  return {
    signature,verifiedLaunches,excludedLaunches,
    completelyVerified:verifiedLaunches.length>0&&excludedLaunches.length===0,
    limitations:[
      "Verifies local instruction structure and transaction account consistency only.",
      "Does not independently validate mint account initialization or historical slot coverage.",
      "Does not confirm a market-cap crossing, pool liquidity, or settlement oracle."
    ]
  };
}
