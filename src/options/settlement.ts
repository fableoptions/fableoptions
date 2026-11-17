/**
 * Settlement adapter contract, disabled by default.
 * A quote or a wallet signature alone is not proof that an option is funded,
 * executed, or settled. Only an independently audited integration can provide
 * those guarantees after verifying actual onchain program state.
 */
export interface SettlementPosition {
  positionId:string;
  underlyingMint:string;
  buyerWallet:string;
  writerWallet:string;
  escrowAccount:string;
  mainnetProgramId:string;
  mintOfCollateral:string;
  collateralAtomicUnits:string;
  payoutCapAtomicUnits:string;
  expiryUnixSeconds:number;
  txSignature:string;
}
export interface VerifiedSettlement {
  positionId:string;
  transactionSignature:string;
  observedSlot:number;
  finalized:boolean;
  collateralAccountVerified:boolean;
  escrowBalanceVerified:boolean;
  programUpgradeAuthorityReviewed:boolean;
  settlementOracleVerified:boolean;
}
export interface VerifiedVenueAdapter {
  id:string;
  /** Must fetch verified chain data, not trust caller-supplied observations. */
  readPosition(id:string):Promise<SettlementPosition>;
  /** Must check finality, PDA ownership, mint decimals, escrow and actual reserves. */
  verifyFunding(position: SettlementPosition):Promise<VerifiedSettlement>;
}
export class ExecutionNotAvailable extends Error {
  constructor(){super("Live options execution is not available: audited escrow, liquidity and legal integration have not been verified");}
}
/** Explicit no-op adapter: prevents any accidental production signing. */
export class DisabledSettlementAdapter implements VerifiedVenueAdapter {
  readonly id="disabled";
  async readPosition(_id:string):Promise<SettlementPosition>{throw new ExecutionNotAvailable();}
  async verifyFunding(_position:SettlementPosition):Promise<VerifiedSettlement>{throw new ExecutionNotAvailable();}
}
export function fullyVerifiedSettlement(x:VerifiedSettlement):boolean{
  return Number.isSafeInteger(x.observedSlot) && x.observedSlot>0 && Boolean(x.positionId && x.transactionSignature) &&
    x.finalized && x.collateralAccountVerified && x.escrowBalanceVerified &&
    x.programUpgradeAuthorityReviewed && x.settlementOracleVerified;
}
