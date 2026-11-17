/**
 * Read-only GitHub Actions smoke test; no assets, keys, or private endpoints.
 * Verifies RPC token-account data retrieval for one already-observed mint.
 */
import {fetchOwnershipAudit} from "./ownership-audit.js";
const mint="31qACV9dPCTbcRky4mv4WRnFFMKy2infA41KHDoTpump";
const endpoint=process.env.SOLANA_RPC_URL??"https://api.mainnet-beta.solana.com";
const result=await fetchOwnershipAudit(endpoint,mint);
process.stdout.write(JSON.stringify({
  mint:result.mint,
  contextSlot:result.contextSlot,
  topTokenAccountPct:result.topTokenAccountPct,
  topTenTokenAccountsPct:result.topTenTokenAccountsPct,
  distinctVisibleOwners:result.distinctVisibleOwners,
  repeatedOwnerAccountCount:result.repeatedOwnerAccountCount,
  observedAt:result.observedAt,
  riskSignals:result.riskSignals,
  beneficialOwnersVerified:false,bundleProven:false
},null,2)+"\n");
