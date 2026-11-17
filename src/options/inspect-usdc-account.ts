/**
 * Read-only manual diagnostic for a proposed native USDC vault.
 * Requires exact expected authority and account address; never builds a
 * transfer or a signed transaction. A matching balance is NOT proof escrow
 * locks funds for an options contract.
 */
import {fetchUsdcAccountInspection} from "./usdc-escrow-inspection.js";
const account=process.env.USDC_ACCOUNT_ADDRESS??"";
const expectedAuthority=process.env.USDC_EXPECTED_AUTHORITY??"";
const requiredMicroUsdc=process.env.USDC_REQUIRED_MICRO??"";
if(!account||!expectedAuthority||!requiredMicroUsdc)
  throw new Error("USDC_ACCOUNT_ADDRESS, USDC_EXPECTED_AUTHORITY and USDC_REQUIRED_MICRO required");
const key=process.env.HELIUS_API_KEY;
const rpc=process.env.SOLANA_RPC_URL??(key?
  `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`:
  "https://api.mainnet-beta.solana.com");
const report=await fetchUsdcAccountInspection(rpc,account,expectedAuthority,requiredMicroUsdc);
process.stdout.write(JSON.stringify({
  ...report,
  verifiedProgramControlledEscrow:false,
  fundsLockedForOption:false,
  realSettlementApproved:false,
  warning:"This read-only snapshot NEVER establishes that an option can be safely funded or settled."
},null,2)+"\n");
if(!report.evidenceConsistent)process.exitCode=2;
