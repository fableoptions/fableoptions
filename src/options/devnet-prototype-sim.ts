/**
 * LOCAL IN-MEMORY EMULATOR of proposed devnet state transitions.
 * Not Solana execution, not a signer, escrow, quote, token or oracle.
 * Must never be used as evidence of live positions or funded balances.
 */
import {previewUsdcPayout,validateUsdcTerms,type UsdcOptionTerms} from "./usdc-settlement-model.js";

export type PrototypePhase="new"|"offered"|"live"|"price_set"|"settled"|"cancelled"|"refunded";
export class DevnetLifecycleSimulator {
  readonly isOnchain=false;
  readonly tradingEnabled=false;
  private phaseValue:PrototypePhase="new";
  private readonly balances=new Map<string,bigint>();
  private vault=0n;
  private buyer:string|null=null;
  private expiryPrice:string|null=null;
  private payout=0n;

  constructor(
    readonly terms:UsdcOptionTerms,
    readonly writer:string,
    readonly oracle:string,
    initialBalances:Readonly<Record<string,string>>
  ){
    validateUsdcTerms(terms);
    if(!writer||!oracle||writer===oracle)throw new Error("invalid_demo_actors");
    for(const [name,amount] of Object.entries(initialBalances)){
      if(!/^(0|[1-9][0-9]*)$/.test(amount))throw new Error("invalid_demo_balance");
      this.balances.set(name,BigInt(amount));
    }
  }
  get phase(){return this.phaseValue;}
  get vaultMicroUsdc(){return this.vault.toString();}
  get totalMicroUsdc(){
    return ([...this.balances.values()].reduce((a,b)=>a+b,0n)+this.vault).toString();
  }
  balance(wallet:string){return (this.balances.get(wallet)??0n).toString();}
  get payoutMicroUsdc(){return this.payout.toString();}

  private moveToVault(from:string,amount:bigint){
    const prior=this.balances.get(from)??0n;
    if(prior<amount)throw new Error("insufficient_mock_funds");
    this.balances.set(from,prior-amount);
    this.vault+=amount;
  }
  private moveFromVault(to:string,amount:bigint){
    if(this.vault<amount)throw new Error("insufficient_mock_vault");
    this.vault-=amount;
    this.balances.set(to,(this.balances.get(to)??0n)+amount);
  }
  offer(signer:string,now:number){
    if(this.phaseValue!=="new"||signer!==this.writer)
      throw new Error("offer_not_authorized");
    if(!Number.isSafeInteger(now)||this.terms.expiryUnixSeconds<=now+60||
       this.terms.expiryUnixSeconds>now+7*86400)
      throw new Error("invalid_demo_expiry");
    this.moveToVault(this.writer,BigInt(this.terms.capMicroUsdc));
    this.phaseValue="offered";
  }
  buy(signer:string,now:number){
    if(this.phaseValue!=="offered"||signer===this.writer||!signer||
       now>=this.terms.expiryUnixSeconds)throw new Error("purchase_not_authorized");
    this.moveToVault(signer,BigInt(this.terms.premiumMicroUsdc));
    this.buyer=signer;this.phaseValue="live";
  }
  publishMockPrice(signer:string,pricePicoUsd:string,now:number){
    if(this.phaseValue!=="live"||signer!==this.oracle)
      throw new Error("oracle_not_authorized");
    if(now<this.terms.expiryUnixSeconds||now>this.terms.expiryUnixSeconds+3600)
      throw new Error("price_outside_demo_window");
    if(!/^(0|[1-9][0-9]*)$/.test(pricePicoUsd))
      throw new Error("invalid_demo_price");
    // Validate preview strictly before advancing state.
    previewUsdcPayout(this.terms,pricePicoUsd);
    this.expiryPrice=pricePicoUsd;
    this.phaseValue="price_set";
  }
  settle(){
    if(this.phaseValue!=="price_set"||!this.buyer||this.expiryPrice===null)
      throw new Error("settlement_not_authorized");
    const preview=previewUsdcPayout(this.terms,this.expiryPrice);
    this.payout=BigInt(preview.payoutMicroUsdc);
    if(this.vault<BigInt(this.terms.capMicroUsdc)+BigInt(this.terms.premiumMicroUsdc))
      throw new Error("insufficient_mock_escrow");
    this.moveFromVault(this.buyer,this.payout);
    this.moveFromVault(this.writer,this.vault);
    this.phaseValue="settled";
    return {
      ...preview,
      phase:this.phaseValue,
      isSimulated:true as const,
      isOnchain:false as const,
      realAssetsTransferred:false as const
    };
  }
  cancel(signer:string){
    if(this.phaseValue!=="offered"||signer!==this.writer)
      throw new Error("cancellation_not_authorized");
    this.moveFromVault(this.writer,this.vault);
    this.phaseValue="cancelled";
  }
  refundOnOracleTimeout(now:number){
    if(this.phaseValue!=="live"||!this.buyer||
       now<=this.terms.expiryUnixSeconds+3600)
      throw new Error("timeout_refund_not_authorized");
    this.moveFromVault(this.buyer,BigInt(this.terms.premiumMicroUsdc));
    this.moveFromVault(this.writer,this.vault);
    this.phaseValue="refunded";
  }
}
