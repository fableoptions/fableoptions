# Fable Options — Solana devnet sandbox

**Status: source code compiles and native Rust unit tests pass. It is not deployed to devnet yet, is not independently audited, and has never handled real USDC. This is NOT the live Fable options exchange.**

The actual onchain Anchor program is in `programs/fable_devnet_options/src/lib.rs`. A separate deterministic TypeScript state-machine simulator and tests live in `../src/options/devnet-prototype-sim.ts` and `../src/options/devnet-prototype-sim.test.ts`.

## Implemented instructions

| Instruction | Action | Authorization |
|---|---|---|
| `initialize` | Record mock oracle and six-decimal legacy SPL **test mint** | initializer signer |
| `create_offer` | Seller escrows maximum capped payoff in a PDA-owned test-token vault | writer signer |
| `buy_offer` | Buyer escrows test-token premium into same vault | buyer signer |
| `publish_mock_expiry` | Report hypothetical price after expiry and during one-hour grace | configured mock oracle signer |
| `settle_mock` | Pay capped TEST-token amount to buyer, remaining locked funds to writer | any signer after mock price |
| `cancel_unsold` | Refund unsold offer escrow to writer | writer signer |
| `refund_without_price` | After mock-oracle deadline, refund buyer premium and writer collateral | any caller; recipient addresses checked |

The vault is an associated token account owned by a PDA derived from the writer's public key plus a nonce. The writer cannot withdraw committed collateral while a purchased option is active. The position state prevents double settlement. Solana transaction atomicity rolls back failed transfers. Math uses checked `u128` intermediate arithmetic and pays whole test-token micro-units. The program rejects **Circle's real Solana USDC mint** and is restricted to the legacy SPL token program for test collateral.

**This is not a claim of a secure audited escrow.** The account-level flows have not yet been exercised in an SVM/local validator integration test, and a mock price reporter can choose any price without independent evidence.

## Build validation

- `cargo check --manifest-path devnet/Cargo.toml`
- `cargo test --manifest-path devnet/Cargo.toml`
- `npm test` at the repository root runs the *local in-memory* option lifecycle simulator.
- `.github/workflows/devnet-anchor-check.yml` checks the Rust program.
- `.github/workflows/devnet-sbf-build.yml` attempts to build an SBF executable through the official Solana CLI and uploads the compiled ELF to GitHub Actions as a short-lived artifact. Compilation is not deployment.

## Why it isn't deployed automatically

Publishing a Solana program requires a real, persistent **devnet deployment signing keypair** and fee-payer account funded with free devnet SOL. No such signer was supplied or created in the existing GitHub/Railway connections. We deliberately have **not** put a deployer private key in a GitHub repository, Railway variable, build log or chat. The example `declare_id!` and `Anchor.toml` address are **placeholders**, not an owned deployed Fable program.

A developer/operator (not a user of the exchange) would:
1. Provision a dedicated devnet-only signer and program ID, sync `declare_id!` and `Anchor.toml` to its generated public key, and keep the private key in a secure vault.
2. Use a six-decimal **disposable test token** (never native USDC), issue test funds to isolated buyer and writer wallets, and fund the deployment fee payer with devnet faucet SOL.
3. Build and deploy to **devnet only** with `anchor build` and `anchor deploy --provider.cluster devnet`.
4. Run real local-SVM transaction tests for full offer / buyer-premium / PDA-vault / oracle / payout / refund lifecycle, including unauthorized-caller, token-mint, replay and arithmetic attacks.
5. Independently inspect deployed program ID, upgrade authority, escrow token accounts and event/transaction receipts.

These steps are **not completed**. The current connected Railway services are deliberately not linked to this unaudited program and continue to refuse real-money trading.

## Critical risks before any mainnet release

- The demo oracle is a centralized mock signer with arbitrary price control, not a manipulation-resistant price source for new Pump.fun tokens.
- It has no token-risk admission screen wired into onchain offering, no sanctions/jurisdictional checks, no independently funded market-making or consumer protection mechanisms.
- It has no independently reviewed security audit, property-based fuzzing, full Solana validator CPI tests, or deployment-binary verification.
- It is not safe to accept real assets. **Never send actual USDC to a vault or token address derived from this experimental contract.**

Upgrading to a production-grade protocol would be a separate project with code audit, robust oracle rules, collateral accounting, economic risk analysis and legal clearance. Nothing here authorizes actual options trading.
