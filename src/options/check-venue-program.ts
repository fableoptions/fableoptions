/**
 * Operator-only, read-only mainnet verification of a candidate Solana venue.
 *
 * Set VENUE_PROGRAM_ID and SOLANA_RPC_URL / HELIUS_API_KEY. Never sends,
 * constructs, or signs a transaction, accepts deposits, or enables trading.
 */
import {inspectProgramOnMainnet} from "./program-attestation.js";
import {venueReadiness} from "./venue-readiness.js";
const programId=process.env.VENUE_PROGRAM_ID??"";
if(!programId)throw new Error("VENUE_PROGRAM_ID must be a concrete externally sourced program id");
const key=process.env.HELIUS_API_KEY;
const endpoint=process.env.SOLANA_RPC_URL??(key?
  `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`:
  "https://api.mainnet-beta.solana.com");
const result=await inspectProgramOnMainnet(endpoint,programId);
process.stdout.write(JSON.stringify({
  inspectedAt:new Date().toISOString(),
  network:"solana-mainnet-beta",
  program:result,
  venue:venueReadiness(),
  integrationStatus:"not_approved_for_fable",
  blockers:[
    "Program identity and upgrade authority inspection does not validate its business logic.",
    "Independent source-code / deployed-binary correspondence and audit are not established.",
    "No token-specific executable options market, collateral escrow, quote or settlement oracle verified.",
    "No wallet transactions, deposits or live option fills can be submitted by this tool."
  ]
},null,2)+"\n");
\n// A missing or invalid mainnet program is a FAILED integration gate, not a successful smoke test.\nif(result.status!=="programdata_matched"||!result.programDataVerified)process.exitCode=2;\n