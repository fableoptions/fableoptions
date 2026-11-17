/**
 * Exact-integer, OFF-CHAIN capped European USDC payoff preview.
 *
 * This calculates what a hypothetical contract WOULD owe, not whether
 * a contract exists or has been funded. Caller-provided expiry prices
 * are never settlement evidence. No signing or token transfer code.
 *
 * Units:
 * - sizeAtomic: underlying token's smallest units
 * - strikePricePicoUsd/expiryPricePicoUsd: USD/token * 10^12
 * - premiumMicroUsdc, capMicroUsdc: USDC * 10^6
 */
export const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;
const PICO_PER_USD = 1_000_000_000_000n;
const MICRO_PER_USD = 1_000_000n;
const MAX_NOTIONAL_ATOMIC = 10n ** 30n;
const MAX_PRICE_PICO = 10n ** 24n;
const MAX_USDC_MICRO = 10n ** 18n;
export type Side = "call" | "put";
export interface UsdcOptionTerms {
  side:Side;
  underlyingMint:string;
  underlyingDecimals:number;
  sizeAtomic:string;
  strikePricePicoUsd:string;
  premiumMicroUsdc:string;
  capMicroUsdc:string;
  expiryUnixSeconds:number;
}
export type UsdcPreview = {
  kind:"hypothetical_usdc_cash_payout";
  payoutMicroUsdc:string;
  buyerNetMicroUsdc:string;
  requiredWriterCollateralMicroUsdc:string;
  premiumMicroUsdc:string;
  payoutCapped:boolean;
  collateralMustBeLockedBeforeTrade:true;
  collateralOnchainVerified:false;
  expiryPriceOracleVerified:false;
  transactionAuthorized:false;
  settled:false;
  disclaimer:string;
};
function unsigned(value:string,upper:bigint,name:string):bigint{
 if(typeof value!=="string"||!/^(0|[1-9][0-9]*)$/.test(value)||value.length>40)
   throw new Error("invalid_"+name);
 const number=BigInt(value);
 if(number>upper)throw new Error("invalid_"+name);
 return number;
}
export function validateUsdcTerms(t:UsdcOptionTerms):void{
 if(t.side!=="call"&&t.side!=="put")throw new Error("invalid_side");
 if(typeof t.underlyingMint!=="string"||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t.underlyingMint))
   throw new Error("invalid_underlying_mint");
 if(!Number.isInteger(t.underlyingDecimals)||t.underlyingDecimals<0||
    t.underlyingDecimals>12)throw new Error("invalid_token_decimals");
 if(!Number.isSafeInteger(t.expiryUnixSeconds)||t.expiryUnixSeconds<=0)
   throw new Error("invalid_expiry");
 if(unsigned(t.sizeAtomic,MAX_NOTIONAL_ATOMIC,"size")===0n)
   throw new Error("invalid_size");
 if(unsigned(t.strikePricePicoUsd,MAX_PRICE_PICO,"strike")===0n)
   throw new Error("invalid_strike");
 unsigned(t.premiumMicroUsdc,MAX_USDC_MICRO,"premium");
 if(unsigned(t.capMicroUsdc,MAX_USDC_MICRO,"cap")===0n)
   throw new Error("invalid_cap");
}
export function previewUsdcPayout(t:UsdcOptionTerms,expiryPricePicoUsd:string):UsdcPreview{
 validateUsdcTerms(t);
 const expiryPrice=unsigned(expiryPricePicoUsd,MAX_PRICE_PICO,"expiry_price");
 const strike=BigInt(t.strikePricePicoUsd);
 const size=BigInt(t.sizeAtomic);
 const cap=BigInt(t.capMicroUsdc);
 const premium=BigInt(t.premiumMicroUsdc);
 const intrinsic=t.side==="call"
   ? (expiryPrice>strike?expiryPrice-strike:0n)
   : (strike>expiryPrice?strike-expiryPrice:0n);
 // Floor USDC atomic amounts in the hypothetical calculation. Never
 // multiply JavaScript floats to determine monetary settlement.
 const raw=intrinsic*size*MICRO_PER_USD/
   (PICO_PER_USD*10n**BigInt(t.underlyingDecimals));
 const payout=raw>cap?cap:raw;
 return {
   kind:"hypothetical_usdc_cash_payout",
   payoutMicroUsdc:payout.toString(),
   buyerNetMicroUsdc:(payout-premium).toString(),
   requiredWriterCollateralMicroUsdc:cap.toString(),
   premiumMicroUsdc:premium.toString(),
   payoutCapped:raw>cap,
   collateralMustBeLockedBeforeTrade:true,
   collateralOnchainVerified:false,
   expiryPriceOracleVerified:false,
   transactionAuthorized:false,
   settled:false,
   disclaimer:"Simulation only. Supplied expiry price is untrusted; no USDC was escrowed, transferred or paid. An audited onchain vault, authenticated oracle and legal clearance are required for real settlement."
 };
}
