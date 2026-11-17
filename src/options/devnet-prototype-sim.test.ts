import test from "node:test";
import assert from "node:assert/strict";
import {DevnetLifecycleSimulator} from "./devnet-prototype-sim.js";
import type {UsdcOptionTerms} from "./usdc-settlement-model.js";
const writer="writer_demo",buyer="buyer_demo",oracle="oracle_demo";
const now=1800000000;
const terms:UsdcOptionTerms={
 side:"call",underlyingMint:"31qACV9dPCTbcRky4mv4WRnFFMKy2infA41KHDoTpump",
 underlyingDecimals:6,sizeAtomic:"100000000000",
 strikePricePicoUsd:"2000000000",premiumMicroUsdc:"20000000",
 capMicroUsdc:"100000000",expiryUnixSeconds:now+3600
};
function demo(t=terms){
 return new DevnetLifecycleSimulator(t,writer,oracle,{
   [writer]:"500000000",[buyer]:"100000000"
 });
}
test("full mock call option flow conserves test balances and pays capped USDC",()=>{
 const x=demo(),total=x.totalMicroUsdc;
 x.offer(writer,now);
 assert.equal(x.balance(writer),"400000000");
 assert.equal(x.vaultMicroUsdc,"100000000");
 x.buy(buyer,now+20);
 assert.equal(x.balance(buyer),"80000000");
 assert.equal(x.vaultMicroUsdc,"120000000");
 assert.throws(()=>x.buy(buyer,now+30),/purchase_not_authorized/);
 x.publishMockPrice(oracle,"5000000000",now+3600);
 const result=x.settle();
 assert.equal(result.payoutMicroUsdc,"100000000");
 assert.equal(result.realAssetsTransferred,false);
 assert.equal(x.balance(buyer),"180000000");
 assert.equal(x.balance(writer),"420000000");
 assert.equal(x.vaultMicroUsdc,"0");
 assert.equal(x.totalMicroUsdc,total);
 assert.equal(x.phase,"settled");
 assert.throws(()=>x.settle(),/settlement_not_authorized/);
});
test("out-of-money call pays seller premium after valid mock expiry",()=>{
 const x=demo();x.offer(writer,now);x.buy(buyer,now+20);
 x.publishMockPrice(oracle,"500000000",now+3600);x.settle();
 assert.equal(x.balance(writer),"520000000");
 assert.equal(x.balance(buyer),"80000000");
});
test("put payoff settles in test USDC without token delivery",()=>{
 const x=demo({...terms,side:"put",capMicroUsdc:"300000000"});
 x.offer(writer,now);x.buy(buyer,now+20);
 x.publishMockPrice(oracle,"500000000",now+3600);
 const result=x.settle();
 assert.equal(result.payoutMicroUsdc,"150000000");
 assert.equal(x.balance(buyer),"230000000");
});
test("writer-only unsold cancellation returns collateral and rejects replay",()=>{
 const x=demo(),total=x.totalMicroUsdc;
 x.offer(writer,now);
 assert.throws(()=>x.cancel(buyer),/cancellation_not_authorized/);
 x.cancel(writer);
 assert.equal(x.balance(writer),"500000000");
 assert.equal(x.vaultMicroUsdc,"0");
 assert.equal(x.totalMicroUsdc,total);
 assert.throws(()=>x.buy(buyer,now+30),/purchase_not_authorized/);
});
test("missing oracle returns premium to buyer and collateral to writer after grace",()=>{
 const x=demo(),total=x.totalMicroUsdc;
 x.offer(writer,now);x.buy(buyer,now+20);
 assert.throws(()=>x.refundOnOracleTimeout(now+3600),/timeout_refund_not_authorized/);
 x.refundOnOracleTimeout(now+3600+3601);
 assert.equal(x.phase,"refunded");
 assert.equal(x.balance(writer),"500000000");
 assert.equal(x.balance(buyer),"100000000");
 assert.equal(x.vaultMicroUsdc,"0");
 assert.equal(x.totalMicroUsdc,total);
 assert.throws(()=>x.publishMockPrice(oracle,"5000000000",now+7200),/oracle_not_authorized/);
});
test("incorrect oracle and premature expiry are refused without moving balances",()=>{
 const x=demo();x.offer(writer,now);x.buy(buyer,now+20);
 const total=x.totalMicroUsdc,locked=x.vaultMicroUsdc;
 assert.throws(()=>x.publishMockPrice(buyer,"5000000000",now+3600),/oracle_not_authorized/);
 assert.throws(()=>x.publishMockPrice(oracle,"5000000000",now+200),/price_outside_demo_window/);
 assert.equal(x.vaultMicroUsdc,locked);
 assert.equal(x.totalMicroUsdc,total);
});
test("insufficient buyer funds cannot mint a fake option position",()=>{
 const x=new DevnetLifecycleSimulator(terms,writer,oracle,{
   [writer]:"100000000",[buyer]:"1"
 });
 x.offer(writer,now);
 assert.throws(()=>x.buy(buyer,now+100),/insufficient_mock_funds/);
 assert.equal(x.phase,"offered");
 assert.equal(x.balance(buyer),"1");
});
