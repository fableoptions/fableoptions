# Fable Options — Solana devnet sandbox

**Status (November 17, 2026): PUBLIC SOLANA DEVNET SMOKE TEST PASSED.** A disposable Anchor program was deployed to public devnet and exercised with valueless six-decimal SPL test tokens. The verified run is [GitHub Actions 44145610549, attempt 2](https://github.com/fableoptions/fableoptions/actions/runs/44145610549). Program ID: `HawZvCmjB9Pj6Gu8AqzyoewtCw4dANiE2Ud1zjBDQqCB`; fake mint: `6uw4TSszCkebzJqNoj887zbWKULrMqxxYzDEeVGYjWdU`. Test assertions passed for create/buy, mock expiry price, settlement, rejection of unauthorized oracle and cancellation, prevention of double settlement, and unsold cancellation. Result: buyer 180,000,000 and writer 120,000,000 fake six-decimal token units. **Not audited, no real USDC, not production-ready.**

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

## Public devnet deployment attempt and no-code funding handoff

As of November 17, 2026, the public-devnet GitHub Actions deployment builds successfully, but **no public devnet deployment succeeded**. Two CLI airdrop attempts failed with rate limits, and the independent devnet proof-of-work faucets returned insufficient available SOL (the current faucet discovery reported balances of mostly zero). The disposable fee-payer remained empty; the workflow correctly refused to deploy. All attempted keys were disposable GitHub runner identities, not user wallets.

- Evidence: [initial standard faucet failure](https://github.com/fableoptions/fableoptions/actions/runs/44142632286), [POW faucet availability check](https://github.com/fableoptions/fableoptions/actions/runs/44145440689).
- The [public devnet smoke test workflow](https://github.com/fableoptions/fableoptions/actions/workflows/public-devnet-options-smoke.yml) is now **manual opt-in only**. It generates disposable devnet program and payer keys and prints the fee payer's **public** address in the `Create disposable DEVNET identities` step.
- A nontechnical authorized operator can open the GitHub Actions workflow, press **Run workflow**, copy the public fee-payer address from the job log, and use their own browser to request **approximately 3 *free* devnet SOL** from a Solana devnet faucet. The job checks the wallet for about ten minutes, then builds and deploys the sandbox only if at least 2.5 devnet SOL arrives. Never send real SOL or actual USDC, and never provide private keys to the chat.
- Public devnet program keys are disposable and **not saved**. A successful run demonstrates real devnet test-token transactions but does not produce a maintainable production deployment or certified escrow. Future persistent deployment would require separately managed devnet-only secrets and owner-approved access.

This manual step is the only user intervention currently required to attempt the public devnet proof. No coding is needed, no purchase is required, and Fable's production services remain disconnected.

## Verified public-devnet milestone and next test gates

- Run **44145610549 (attempt 2)** completed successfully with log marker `PASSED_PUBLIC_DEVNET`.
- The program ID above is disposable and should NOT be used as a production or permanent Fable address. Deployment success does not establish a secure, upgradeable production program.
- Next: add the public-devnet **oracle-timeout refund** and negative-path account substitution tests, full vault-balance invariants and signed transaction receipts; then wire backend quote/risk-admission simulator to the test-only contract without introducing a live deposit path.
- Do not enable a real-money UI, real USDC deposits, or a mainnet signing path. Independent audit, market integrity/oracle design, settlement controls, and legal review remain mandatory before any production launch.

## Critical risks before any mainnet release

- The demo oracle is a centralized mock signer with arbitrary price control, not a manipulation-resistant price source for new Pump.fun tokens.
- It has no token-risk admission screen wired into onchain offering, no sanctions/jurisdictional checks, no independently funded market-making or consumer protection mechanisms.
- It has no independently reviewed security audit, property-based fuzzing, full Solana validator CPI tests, or deployment-binary verification.
- It is not safe to accept real assets. **Never send actual USDC to a vault or token address derived from this experimental contract.**

Upgrading to a production-grade protocol would be a separate project with code audit, robust oracle rules, collateral accounting, economic risk analysis and legal clearance. Nothing here authorizes actual options trading.
