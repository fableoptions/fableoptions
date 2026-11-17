import { DisabledSettlementAdapter, ExecutionNotAvailable, type VerifiedVenueAdapter, type VerifiedSettlement } from "./settlement.js";

/** A single explicit, fail-closed source of truth for the current execution boundary.
 * A signed RFQ is NOT an options contract and is NOT evidence of collateral.
 */
export interface VenueReadiness {
  status: "unavailable" | "verified";
  venueId: string | null;
  acceptingDeposits: false;
  acceptingTrades: false;
  collateralVerified: false;
  quoteExecutable: false;
  reasons: string[];
}
const BLOCKERS = [
  "No independently verified audited settlement venue configured",
  "No onchain escrow/collateral verification integrated",
  "No verified executable counterparties or token-specific oracle",
  "Regulatory and jurisdictional launch clearance outstanding"
];
export function venueReadiness(): VenueReadiness {
  return {
    status:"unavailable", venueId:null, acceptingDeposits:false,
    acceptingTrades:false, collateralVerified:false, quoteExecutable:false,
    reasons:[...BLOCKERS]
  };
}
export function ensureExecutableVenue(_adapter: VerifiedVenueAdapter = new DisabledSettlementAdapter()): never {
  // Intentionally impossible to enable by setting an environment variable.
  throw new ExecutionNotAvailable();
}
/** Verification evidence for research only; insufficient for live execution.
 * Never use caller-supplied VerifiedSettlement JSON to unlock execution.
 */
export function reportVerificationEvidence(evidence: VerifiedSettlement) {
  return {
    positionId:evidence.positionId,
    reportedFinality:Boolean(evidence.finalized),
    independentlyVerified:false,
    executable:false,
    warning:"Caller-provided settlement evidence is not independently verified onchain."
  } as const;
}
