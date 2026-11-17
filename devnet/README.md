# Fable Options — Solana devnet sandbox

**Status (November 17, 2026): Rust and TypeScript tests pass, an SBF executable was compiled, and actual program instructions passed on a disposable LOCAL Solana validator. The program has NOT been deployed to public devnet or mainnet, is NOT audited, and has handled NO real USDC. This is NOT the live Fable options exchange.**

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

**This is not a claim of a secure audited escrow.** The program-controlled transfers and key authorization/settlement transitions have been tested on a local validator. A mock price reporter can still choose any price without independent evidence. Oracle timeouts, hostile token-program integrations and other attack scenarios have not been independently audited or exhaustively exercised.

## Build validation

- `cargo check --manifest-path devnet/Cargo.toml`
- `cargo test --manifest-path devnet/Cargo.toml`
- `npm test` at the repository root runs the *local in-memory* option lifecycle simulator.
- `.github/workflows/devnet-anchor-check.yml` checks the Rust program.
- `.github/workflows/devnet-sbf-build.yml` builds an SBF executable using the official Solana CLI, generates disposable test signing keys, deploys it to an **isolated local validator**, creates a six-decimal fake token, sends actual Solana instructions, and uploads the compiled ELF as a short-lived GitHub artifact. This is not a public devnet deployment.
- **Verified local-validator transaction run:** https://github.com/fableoptions/fableoptions/actions/runs/44140237157 — `PASSED_LOCAL_VALIDATOR`. Test steps: `create_offer`, `buy_offer`, unauthorized oracle rejection, `publish_mock_expiry`, `settle_mock`, double-settlement rejection and `cancel_unsold`.
- The passing run's disposable test token ended with **180 test USDC for buyer** and **120 for writer** (6-decimal micro-unit amounts: 180000000 and 120000000); the vault was emptied and closed. No real value was transferred.

## Why it isn't deployed automatically

Publishing a Solana program requires a real, persistent **devnet deployment signing keypair** and fee-payer account funded with free devnet SOL. No such signer was supplied or created in the existing GitHub/Railway connections. We deliberately have **not** put a deployer private key in a GitHub repository, Railway variable, build log or chat. The example `declare_id!` and `Anchor.toml` address are **placeholders**, not an owned deployed Fable program.

A developer/operator (not a user of the exchange) would:
1. Provision a dedicated devnet-only signer and program ID, sync `declare_id!` and `Anchor.toml` to its generated public key, and keep the private key in a secure vault.
2. Use a six-decimal **disposable test token** (never native USDC), issue test funds to isolated buyer and writer wallets, and fund the deployment fee payer with devnet faucet SOL.
3. Build and deploy to **devnet only** with `anchor build` and `anchor deploy --provider.cluster devnet`.
4. Expand the already passing local-validator instruction tests to cover onchain *oracle-timeout refunds*, hostile token-program accounts, property-based fuzzing and more comprehensive unauthorized-caller and replay cases.
5. Independently inspect deployed program ID, upgrade authority, escrow token accounts and event/transaction receipts.

Public devnet deployment, persistent deployment key management and comprehensive adversarial tests are **not completed**. The current connected Railway services are deliberately not linked to this unaudited program and continue to refuse real-money trading.

## Public devnet funding after shared-runner faucet rate limits

The public devnet Actions workflow uses a **fresh disposable program key** per attempt. Its
fee payer can be either a disposable runner wallet (which depends on Solana's free
public faucet) or a **separate, dedicated devnet-only test keypair** stored under
GitHub Actions repository secret `FABLE_DEVNET_TEST_PAYER_B64`. This is never a
mainnet or user trading wallet. The secret's value must be base64 of a 64-number
JSON Solana keypair file, not its public address.

The workflow first checks its fee payer balance and attempts up to two free public
devnet airdrops if below 2.5 devnet SOL. If still unfunded, it fails **before**
building or deploying. The previous proof-of-work faucet fallback was removed
because it compiled but reported "No faucets found" on public devnet. The
2.5 SOL threshold is an operational test budget, not a guarantee of adequate
rent if the program binary changes. No paid RPC or purchased SOL is required.

**Operator instructions (when faucet funding is unavailable in GitHub Actions):**
1. Generate a **new keypair exclusively for disposable devnet testing** in a
   trustworthy local Solana CLI environment and securely retain the local key.
   Do not recycle any wallet that has ever held real assets.
2. Use Solana's official free devnet faucet to fund the keypair's **public**
   address with at least 2.5 devnet SOL. Do not send real SOL or USDC.
3. Base64 encode the JSON keypair file **locally**, then put the result directly
   into GitHub repository Settings → Secrets and variables → Actions as secret
   `FABLE_DEVNET_TEST_PAYER_B64`. Never paste a secret into chat, commit it,
   upload it as a workflow artifact, or print it in job logs.
4. Manually dispatch the workflow `Public Solana devnet Fable options test`.
   Review the deployed **public devnet** program ID and fake-token transaction
   evidence. The workflow removes keypair files from its runner at completion.

The repository's public devnet test has not passed until Actions logs explicitly
print `PASSED_PUBLIC_DEVNET`. A passing local-validator test is not equivalent
to a public devnet deployment. The shared payer is for valueless tests only.

## Critical risks before any mainnet release

- The demo oracle is a centralized mock signer with arbitrary price control, not a manipulation-resistant price source for new Pump.fun tokens.
- It has no token-risk admission screen wired into onchain offering, no sanctions/jurisdictional checks, no independently funded market-making or consumer protection mechanisms.
- It has no independently reviewed security audit, property-based fuzzing, full Solana validator CPI tests, or deployment-binary verification.
- It is not safe to accept real assets. **Never send actual USDC to a vault or token address derived from this experimental contract.**

Upgrading to a production-grade protocol would be a separate project with code audit, robust oracle rules, collateral accounting, economic risk analysis and legal clearance. Nothing here authorizes actual options trading.
