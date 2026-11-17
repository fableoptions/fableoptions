/**
 * Real Solana instruction smoke test against a disposable LOCAL validator only.
 * Ephemeral keys, fake six-decimal SPL tokens, a trusted mock price.
 * No mainnet/devnet RPC targets permitted and no real USDC accepted.
 */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {
  Connection,Keypair,PublicKey,SystemProgram,Transaction,TransactionInstruction,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  createMint,getAssociatedTokenAddressSync,getOrCreateAssociatedTokenAccount,
  getAccount,mintTo,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";

const rpc=process.env.FABLE_LOCAL_RPC??"http://127.0.0.1:8899";
if(!["http://127.0.0.1:8899","http://localhost:8899"].includes(rpc))
  throw new Error("local_validator_only");
const path=process.env.FABLE_TEST_PAYER_KEYPAIR;
const programString=process.env.FABLE_TEST_PROGRAM_ID;
if(!path||!programString)throw new Error("test_payer_and_program_id_required");
const payer=Keypair.fromSecretKey(Uint8Array.from(
  JSON.parse(readFileSync(path,"utf8")) as number[]));
const programId=new PublicKey(programString);
const connection=new Connection(rpc,"confirmed");
const writer=Keypair.generate(),buyer=Keypair.generate();
const underlying=Keypair.generate().publicKey;

const b8=(num:bigint)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(num);return b;};
const i8=(num:bigint)=>{const b=Buffer.alloc(8);b.writeBigInt64LE(num);return b;};
const disc=(name:string)=>createHash("sha256")
 .update("global:"+name).digest().subarray(0,8);
const k=(pubkey:PublicKey,isSigner=false,isWritable=false)=>({
 pubkey,isSigner,isWritable
});
function ix(name:string,keys:ReturnType<typeof k>[],args=Buffer.alloc(0)){
 return new TransactionInstruction({programId,keys,
  data:Buffer.concat([disc(name),args])});
}
async function send(name:string,instruction:TransactionInstruction,signers:Keypair[]){
 const tx=new Transaction().add(instruction);
 tx.feePayer=payer.publicKey;
 try{return await sendAndConfirmTransaction(connection,tx,[payer,...signers],{
  commitment:"confirmed"
 });}catch(error){
  throw new Error(name+" failed: "+String(error));
 }
}
const config=PublicKey.findProgramAddressSync([Buffer.from("config")],programId)[0];
const pos=(n:bigint)=>PublicKey.findProgramAddressSync(
 [Buffer.from("position"),writer.publicKey.toBuffer(),b8(n)],programId)[0];
const vault=(p:PublicKey)=>getAssociatedTokenAddressSync(
 testMint,p,true,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID);

let testMint:PublicKey;
async function main(){
 await send("fund writer",SystemProgram.transfer({
  fromPubkey:payer.publicKey,toPubkey:writer.publicKey,lamports:500_000_000
 }),[]);
 testMint=await createMint(connection,payer,payer.publicKey,null,6,undefined,
  {commitment:"confirmed"},TOKEN_PROGRAM_ID);
 const writerToken=(await getOrCreateAssociatedTokenAccount(
  connection,payer,testMint,writer.publicKey)).address;
 const buyerToken=(await getOrCreateAssociatedTokenAccount(
  connection,payer,testMint,buyer.publicKey)).address;
 await mintTo(connection,payer,testMint,writerToken,payer,200_000_000n);
 await mintTo(connection,payer,testMint,buyerToken,payer,100_000_000n);
 await send("initialize",ix("initialize",[
  k(payer.publicKey,true,true),k(config,false,true),k(testMint),
  k(SystemProgram.programId)
 ],payer.publicKey.toBuffer()),[]);
 const makeOffer=async(nonce:bigint,expiry:bigint)=>{
  const p=pos(nonce),v=vault(p);
  const args=Buffer.concat([
   b8(nonce),underlying.toBuffer(),Buffer.from([0,6]),
   b8(100_000_000_000n),b8(2_000_000_000n),
   b8(20_000_000n),b8(100_000_000n),i8(expiry)
  ]);
  await send("create_offer",ix("create_offer",[
   k(writer.publicKey,true,true),k(config),k(testMint),
   k(p,false,true),k(writerToken,false,true),k(v,false,true),
   k(TOKEN_PROGRAM_ID),k(ASSOCIATED_TOKEN_PROGRAM_ID),
   k(SystemProgram.programId)
  ],args),[writer]);
  return {p,v};
 };
 const expiry=BigInt(Math.floor(Date.now()/1000)+75);
 const {p,v}=await makeOffer(1n,expiry);
 if((await getAccount(connection,v,"confirmed")).amount!==100_000_000n)
   throw new Error("writer_collateral_not_locked");
 await send("buy_offer",ix("buy_offer",[
   k(buyer.publicKey,true,true),k(config),k(testMint),k(p,false,true),
   k(buyerToken,false,true),k(writerToken,false,true),k(v,false,true),k(TOKEN_PROGRAM_ID)
 ]),[buyer]);
 if((await getAccount(connection,v,"confirmed")).amount!==120_000_000n)
   throw new Error("buyer_premium_not_escrowed");

 // Negative-path regression: an active trade must not refund before the
 // oracle grace deadline, even if anyone invokes the timeout instruction.
 const prematureRefund=ix("refund_without_price",[
   k(config),k(testMint),k(p,false,true),
   k(writer.publicKey,false,true),k(writerToken,false,true),
   k(buyerToken,false,true),k(v,false,true),k(TOKEN_PROGRAM_ID)
 ]);
 let prematureRefundDenied=false;
 try{await send("reject_premature_refund",prematureRefund,[]);}
 catch{prematureRefundDenied=true;}
 if(!prematureRefundDenied)throw new Error("premature_refund_accepted");
 if((await getAccount(connection,v,"confirmed")).amount!==120_000_000n)
   throw new Error("premature_refund_modified_collateral");

 // Negative-path regression: substituting the writer's token account as the
 // buyer payout destination must be rejected by onchain owner constraints.
 const wrongBuyerDestination=ix("settle_mock",[
   k(payer.publicKey,true),k(config),k(testMint),k(p,false,true),
   k(writerToken,false,true),k(writerToken,false,true),
   k(v,false,true),k(writer.publicKey,false,true),k(TOKEN_PROGRAM_ID)
 ]);
 let payoutSubstitutionDenied=false;
 try{await send("reject_payout_substitution",wrongBuyerDestination,[]);}
 catch{payoutSubstitutionDenied=true;}
 if(!payoutSubstitutionDenied)throw new Error("substituted_buyer_destination_accepted");
 if((await getAccount(connection,v,"confirmed")).amount!==120_000_000n)
   throw new Error("payout_substitution_modified_collateral");

 // Exercise unauthorized mock price rejection before testing valid oracle.
 let denied=false;
 try{await send("unauthorized_mock_price",ix("publish_mock_expiry",[
  k(buyer.publicKey,true),k(config),k(p,false,true)
 ],b8(5_000_000_000n)),[buyer]);}catch{denied=true;}
 if(!denied)throw new Error("unauthorized_mock_oracle_accepted");

 // Real clock time passes on local validator; no falsified onchain expiry.
 while(Math.floor(Date.now()/1000)<Number(expiry)+1)
   await new Promise(resolve=>setTimeout(resolve,1000));
 await send("publish_mock_expiry",ix("publish_mock_expiry",[
  k(payer.publicKey,true),k(config),k(p,false,true)
 ],b8(5_000_000_000n)),[]);
 const settle=ix("settle_mock",[
  k(payer.publicKey,true),k(config),k(testMint),k(p,false,true),
  k(buyerToken,false,true),k(writerToken,false,true),k(v,false,true),
  k(writer.publicKey,false,true),k(TOKEN_PROGRAM_ID)
 ]);
 await send("settle_mock",settle,[]);
 const buyerAfter=(await getAccount(connection,buyerToken,"confirmed")).amount;
 const writerAfter=(await getAccount(connection,writerToken,"confirmed")).amount;
 if(buyerAfter!==180_000_000n||writerAfter!==120_000_000n)
  throw new Error("unexpected_onchain_usdc_payout"+
   JSON.stringify({buyer:String(buyerAfter),writer:String(writerAfter)}));
 if(await connection.getAccountInfo(v,"confirmed")!==null)
  throw new Error("vault_not_closed");
 denied=false;
 try{await send("double_settle",settle,[]);}catch{denied=true;}
 if(!denied)throw new Error("double_payout_accepted");

 // Unsold writer order returns all collateral; no buyer payment.
 const second=await makeOffer(2n,BigInt(Math.floor(Date.now()/1000)+120));
 // An unrelated caller must not be able to cancel an unsold writer escrow.
 let unauthorizedCancelDenied=false;
 try{
  await send("unauthorized_cancel",ix("cancel_unsold",[
   k(config),k(testMint),k(second.p,false,true),
   k(writer.publicKey,false,true),k(writerToken,false,true),
   k(buyerToken,false,true),k(second.v,false,true),k(TOKEN_PROGRAM_ID)
  ]),[buyer]);
 }catch{unauthorizedCancelDenied=true;}
 if(!unauthorizedCancelDenied)throw new Error("non_writer_cancel_accepted");
 if((await getAccount(connection,second.v,"confirmed")).amount!==100_000_000n)
  throw new Error("unauthorized_cancel_changed_vault");
 await send("cancel_unsold",ix("cancel_unsold",[
   k(config),k(testMint),k(second.p,false,true),
   k(writer.publicKey,true,true),k(writerToken,false,true),
   k(buyerToken,false,true),k(second.v,false,true),k(TOKEN_PROGRAM_ID)
 ]),[writer]);
 if((await getAccount(connection,writerToken,"confirmed")).amount!==120_000_000n)
  throw new Error("unsold_collateral_not_refunded");
 if(await connection.getAccountInfo(second.v,"confirmed")!==null)
  throw new Error("cancelled_vault_not_closed");
 console.log(JSON.stringify({
  status:"PASSED_LOCAL_VALIDATOR",
  network:"local-validator-only",notDevnetDeployment:true,
  programId:programId.toBase58(),mint:testMint.toBase58(),
  exercised:["create_offer","buy_offer","reject_unauthorized_price",
   "publish_mock_expiry","settle_mock","reject_double_settle",
   "reject_unauthorized_cancel","cancel_unsold",
   "reject_premature_refund","reject_payout_substitution"],
  buyerFinalMicroTestUsd:String(buyerAfter),
  writerFinalMicroTestUsd:String(writerAfter),
  liveUsdcTransferred:false,realMoneyTradingEnabled:false
 },null,2));
}
await main();
