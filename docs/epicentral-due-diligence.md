# Epicentral integration due diligence — November 17, 2026

**Decision: NO-GO for real-money options integration at present.** Do not attribute partnership, use of the Solana Options Standard, audits, executable bids or price settlement to Fable.

## Direct public evidence

- Current product site: https://beta.epicentral.markets/ — describes American-style options for virtually any Solana token and option pools; as checked November 17, 2026, the page labels its own counters as test funds and showed $0 volume, 0 trades, and $0 TVL.
- Epicentral official organization: https://github.com/EpicentralLabs — available repository listing did not expose a current full integration SDK/IDL suitable for independently implementing mainnet collateral lock/exercise/settle flows.
- Historical SDK page https://github.com/EpicentralLabs/solana-options-standard redirected to solana-options-standard-sdk in a stale snapshot; the redirected repository itself returned 404 on follow-up. This is NOT usable evidence of current deployable code.
- Epicentral publicly announced Sec3 as auditor in social posts. Auditor's public index at https://github.com/sec3-service/reports did NOT list a published Epicentral options-program report when reviewed. Auditor engagement is not equal to a released audit or audited deployed binary.
- Independent directory https://solanacompass.com/projects/epicentral-labs describes a beta and cautions audit status may be incomplete; not authoritative for integration.

## Fable-specific compatibility questions unresolved

1. Which verified mainnet program IDs, published IDL, instruction docs and canonical SDK package/commit should a third-party integrator use?
2. Do *all* recently minted Pump.fun SPL/Token-2022 mints qualify, without approval/whitelisting?
3. Are Fable's **capped** cash-settled calls/puts expressible? Epicentral advertises **American-style** contracts, while Fable's pricing examples are **European-style terminal cash payoffs**. These are NOT interchangeable.
4. Where is the payout oracle for unlisted, low-liquidity Pump.fun mints? How is manipulation at expiry prevented?
5. Exactly which asset serves as writer escrow, what locks reserve funds against the *maximum gross payout*, and can a writer withdraw before expiry?
6. Are the audit report, audited commit hash, deployed binary and current upgrade authority independently verifiable?
7. Is settlement accessible to Fable's intended jurisdictions and lawful for covered instruments?

## Implementation impact

- No Epicentral program ID, SDK, signer, escrow address or contract instructions have been hardcoded.
- `/v1/options/venue-candidates` exposes the research blockers; it is not executable integration.
- Fable's RFQ and payoff analytics remain independent and safely labeled indicative/theoretical.
- Do not deploy mainnet liquidity, deposits or settlement until every gate is resolved and independently tested.

## Other options

- Opta: https://github.com/nankolib/opta claims use of Pyth-priceable underlying assets, which cannot be presumed available for new Pump.fun mints. Its published audit claims are not independent proof of a secure mainnet binary.
- Skew: https://github.com/skew-labs/skewarchive describes devnet RFQ infrastructure for a selected launch asset set, not arbitrary Solana meme tokens.

**Conclusion:** An actual partner or audited protocol that explicitly handles arbitrary fresh Pump.fun mints remains missing. The architecture for Fable's requested product cannot currently rely on Epicentral without further evidence.
