//! UN-AUDITED / DEVNET SANDBOX ONLY. DO NOT DEPLOY TO MAINNET.
//! Mock admin-signed expiry prices are intentionally NOT a safe market oracle.
//! Use only a freely minted TEST token with six decimals (never real USDC).
//! No Fable backend production endpoint invokes these instructions.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked},
};

// PLACEHOLDER! Replaced by the generated devnet program keypair BEFORE any deployment.
// This ID is not a claim that Fable currently owns/deployed this address.
declare_id!("Fg6PaFpoGXkYsidMpWxqSWYKuD8D7j7XQyVd7U5g4bD");

const PICO_PER_USD: u128 = 1_000_000_000_000;
const MICRO_PER_USD: u128 = 1_000_000;
const MAX_LIFETIME: i64 = 7 * 24 * 3600;
const PRICE_GRACE: i64 = 3600;
const MAX_PRICE_PICO: u64 = 1_000_000_000_000_000;
const MAX_CAP_MICRO: u64 = 1_000_000_000_000; // test 1 million USD max in micro-units

#[program]
pub mod fable_devnet_options {
    use super::*;

    // One test configuration per deployed program, with a trusted mock reporter.
    pub fn initialize(ctx: Context<Initialize>, mock_oracle: Pubkey) -> Result<()> {
        require!(mock_oracle != Pubkey::default(), DevnetError::InvalidOracle);
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.mock_oracle = mock_oracle;
        config.test_usdc_mint = ctx.accounts.test_usdc_mint.key();
        config.bump = ctx.bumps.config;
        Ok(())
    }

    // Writer deposits the full capped payout into a PDA-owned TEST-token vault.
    // The offer is non-executable until a buyer expressly accepts on devnet.
    pub fn create_offer(
        ctx: Context<CreateOffer>,
        nonce: u64,
        underlying_mint: Pubkey,
        side: u8,
        underlying_decimals: u8,
        size_atomic: u64,
        strike_pico: u64,
        premium_micro: u64,
        cap_micro: u64,
        expiry_unix: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(side <= 1, DevnetError::InvalidSide);
        require!(underlying_mint != Pubkey::default(), DevnetError::InvalidUnderlying);
        require!(underlying_decimals <= 9, DevnetError::InvalidDecimals);
        require!(size_atomic > 0 && strike_pico > 0 && strike_pico <= MAX_PRICE_PICO,
            DevnetError::InvalidTerms);
        require!(premium_micro > 0 && cap_micro > 0 && cap_micro <= MAX_CAP_MICRO,
            DevnetError::InvalidTerms);
        require!(expiry_unix >= now.saturating_add(60)
            && expiry_unix <= now.saturating_add(MAX_LIFETIME),
            DevnetError::InvalidExpiry);

        let position = &mut ctx.accounts.position;
        position.config = ctx.accounts.config.key();
        position.writer = ctx.accounts.writer.key();
        position.buyer = Pubkey::default();
        position.underlying_mint = underlying_mint;
        position.nonce = nonce;
        position.bump = ctx.bumps.position;
        position.side = side;
        position.underlying_decimals = underlying_decimals;
        position.size_atomic = size_atomic;
        position.strike_pico = strike_pico;
        position.premium_micro = premium_micro;
        position.cap_micro = cap_micro;
        position.expiry_unix = expiry_unix;
        position.mock_price_pico = 0;
        position.payout_micro = 0;
        position.phase = Phase::Offered;

        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), TransferChecked {
                mint: ctx.accounts.test_usdc_mint.to_account_info(),
                from: ctx.accounts.writer_tokens.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.writer.to_account_info(),
            }),
            cap_micro,
            6,
        )?;
        Ok(())
    }

    // Buyer locks test-token premium in the PDA vault until valid mock settlement.
    // Both parties' addresses are stored and cannot be modified afterward.
    pub fn buy_offer(ctx: Context<BuyOffer>) -> Result<()> {
        let pos = &mut ctx.accounts.position;
        require!(pos.phase == Phase::Offered, DevnetError::InvalidPhase);
        require!(Clock::get()?.unix_timestamp < pos.expiry_unix, DevnetError::Expired);
        require_keys_neq!(ctx.accounts.buyer.key(), pos.writer, DevnetError::SelfTrade);
        require!(ctx.accounts.vault.amount >= pos.cap_micro, DevnetError::VaultNotFunded);

        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), TransferChecked {
                mint: ctx.accounts.test_usdc_mint.to_account_info(),
                from: ctx.accounts.buyer_tokens.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            }),
            pos.premium_micro,
            6,
        )?;
        pos.buyer = ctx.accounts.buyer.key();
        pos.phase = Phase::Live;
        Ok(())
    }

    // Intentionally centralized MOCK oracle for testing ONLY.
    // Real-money options MUST NOT use this reporter or a single DEX TWAP.
    pub fn publish_mock_expiry(ctx: Context<PublishMockExpiry>, price_pico: u64) -> Result<()> {
        let pos = &mut ctx.accounts.position;
        let now = Clock::get()?.unix_timestamp;
        require!(pos.phase == Phase::Live, DevnetError::InvalidPhase);
        require_keys_eq!(ctx.accounts.reporter.key(), ctx.accounts.config.mock_oracle,
            DevnetError::NotOracle);
        require!(now >= pos.expiry_unix, DevnetError::NotExpired);
        require!(now <= pos.expiry_unix.saturating_add(PRICE_GRACE),
            DevnetError::PriceDeadline);
        require!(price_pico <= MAX_PRICE_PICO, DevnetError::InvalidTerms);
        pos.mock_price_pico = price_pico;
        pos.phase = Phase::PriceSet;
        Ok(())
    }

    // Any caller can finalize a position with a recorded TEST price.
    // The buyer receives the capped TEST-USDC payout; the writer gets the rest.
    // This is NOT a production oracle or an audited settlement program.
    pub fn settle_mock(ctx: Context<SettleMock>) -> Result<()> {
        let pos = &mut ctx.accounts.position;
        require!(pos.phase == Phase::PriceSet, DevnetError::InvalidPhase);
        let payout = capped_payout(
            pos.side, pos.strike_pico, pos.mock_price_pico,
            pos.size_atomic, pos.underlying_decimals, pos.cap_micro
        )?;
        let vault_balance = ctx.accounts.vault.amount;
        let expected = pos.cap_micro.checked_add(pos.premium_micro)
            .ok_or(error!(DevnetError::MathOverflow))?;
        require!(vault_balance >= expected, DevnetError::VaultNotFunded);
        let refund = vault_balance.checked_sub(payout)
            .ok_or(error!(DevnetError::MathOverflow))?;
        pos.payout_micro = payout;
        pos.phase = Phase::Settled; // set before token CPIs; failures roll back atomically

        let writer = pos.writer;
        let nonce = pos.nonce.to_le_bytes();
        let bump = [pos.bump];
        let seeds: &[&[u8]] = &[b"position", writer.as_ref(), nonce.as_ref(), bump.as_ref()];
        let signer: &[&[&[u8]]] = &[seeds];
        if payout > 0 {
            token_interface::transfer_checked(
                CpiContext::new(ctx.accounts.token_program.key(), TransferChecked {
                    mint: ctx.accounts.test_usdc_mint.to_account_info(),
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.buyer_tokens.to_account_info(),
                    authority: pos.to_account_info(),
                }).with_signer(signer),
                payout, 6,
            )?;
        }
        if refund > 0 {
            token_interface::transfer_checked(
                CpiContext::new(ctx.accounts.token_program.key(), TransferChecked {
                    mint: ctx.accounts.test_usdc_mint.to_account_info(),
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.writer_tokens.to_account_info(),
                    authority: pos.to_account_info(),
                }).with_signer(signer),
                refund, 6,
            )?;
        }
        token_interface::close_account(
            CpiContext::new(ctx.accounts.token_program.key(), CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.writer.to_account_info(),
                authority: pos.to_account_info(),
            }).with_signer(signer)
        )?;
        Ok(())
    }

    // Unsold offer: only original writer may cancel, all vault tokens refunded.
    pub fn cancel_unsold(mut ctx: Context<WriterRefund>) -> Result<()> {
        require!(ctx.accounts.position.phase == Phase::Offered, DevnetError::InvalidPhase);
        require!(ctx.accounts.writer.to_account_info().is_signer, DevnetError::WriterMustSign);
        return_to_writer(&mut ctx.accounts, Phase::Cancelled)
    }

    // Devnet-only liveness escape hatch. If mock oracle fails to report
    // after one hour, test premium returns to buyer and collateral to writer.
    pub fn refund_without_price(mut ctx: Context<WriterRefund>) -> Result<()> {
        let pos = &ctx.accounts.position;
        require!(pos.phase == Phase::Live, DevnetError::InvalidPhase);
        require!(Clock::get()?.unix_timestamp > pos.expiry_unix.saturating_add(PRICE_GRACE),
            DevnetError::PriceDeadline);
        return_to_writer(&mut ctx.accounts, Phase::Refunded)
    }
}

fn return_to_writer(accounts: &mut WriterRefund<'_>, next: Phase) -> Result<()> {
    let pos = &mut accounts.position;
    pos.phase = next;
    let writer = pos.writer;
    let nonce = pos.nonce.to_le_bytes();
    let bump = [pos.bump];
    let seeds: &[&[u8]] = &[b"position", writer.as_ref(), nonce.as_ref(), bump.as_ref()];
    let signer: &[&[&[u8]]] = &[seeds];
    let vault_total = accounts.vault.amount;
    let premium_refund = if next == Phase::Refunded { pos.premium_micro } else { 0 };
    let expected = pos.cap_micro.checked_add(premium_refund)
        .ok_or(error!(DevnetError::MathOverflow))?;
    require!(vault_total >= expected, DevnetError::VaultNotFunded);
    if premium_refund > 0 {
        require_keys_eq!(accounts.buyer_tokens.owner, pos.buyer,
            DevnetError::IncorrectBuyerRefund);
        token_interface::transfer_checked(
            CpiContext::new(accounts.token_program.key(), TransferChecked {
                mint: accounts.test_usdc_mint.to_account_info(),
                from: accounts.vault.to_account_info(),
                to: accounts.buyer_tokens.to_account_info(),
                authority: pos.to_account_info(),
            }).with_signer(signer),
            premium_refund, 6,
        )?;
    }
    let amount = vault_total.checked_sub(premium_refund)
        .ok_or(error!(DevnetError::MathOverflow))?;
    if amount > 0 {
        token_interface::transfer_checked(
            CpiContext::new(accounts.token_program.key(), TransferChecked {
                mint: accounts.test_usdc_mint.to_account_info(),
                from: accounts.vault.to_account_info(),
                to: accounts.writer_tokens.to_account_info(),
                authority: pos.to_account_info(),
            }).with_signer(signer),
            amount, 6,
        )?;
    }
    token_interface::close_account(
        CpiContext::new(accounts.token_program.key(), CloseAccount {
            account: accounts.vault.to_account_info(),
            destination: accounts.writer.to_account_info(),
            authority: pos.to_account_info(),
        }).with_signer(signer)
    )?;
    Ok(())
}

pub fn capped_payout(side: u8, strike: u64, expiry_price: u64,
    size_atomic: u64, underlying_decimals: u8, cap_micro: u64) -> Result<u64> {
    require!(side <= 1 && underlying_decimals <= 9 && cap_micro > 0,
        DevnetError::InvalidTerms);
    let intrinsic = if side == 0 { expiry_price.saturating_sub(strike) }
        else { strike.saturating_sub(expiry_price) };
    let numerator = (intrinsic as u128)
        .checked_mul(size_atomic as u128)
        .and_then(|v| v.checked_mul(MICRO_PER_USD))
        .ok_or(error!(DevnetError::MathOverflow))?;
    let denominator = PICO_PER_USD
        .checked_mul(10_u128.pow(underlying_decimals as u32))
        .ok_or(error!(DevnetError::MathOverflow))?;
    let payout = numerator / denominator;
    Ok(payout.min(cap_micro as u128) as u64)
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub mock_oracle: Pubkey,
    pub test_usdc_mint: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub config: Pubkey,
    pub writer: Pubkey,
    pub buyer: Pubkey,
    pub underlying_mint: Pubkey,
    pub nonce: u64,
    pub bump: u8,
    pub side: u8,                 // 0 call, 1 put
    pub underlying_decimals: u8,
    pub size_atomic: u64,
    pub strike_pico: u64,
    pub premium_micro: u64,
    pub cap_micro: u64,
    pub expiry_unix: i64,
    pub mock_price_pico: u64,
    pub payout_micro: u64,
    pub phase: Phase,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Phase { Offered, Live, PriceSet, Settled, Cancelled, Refunded }

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE,
        seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(constraint = test_usdc_mint.decimals == 6 @ DevnetError::InvalidDecimals)]
    pub test_usdc_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateOffer<'info> {
    #[account(mut)]
    pub writer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump,
        has_one = test_usdc_mint)]
    pub config: Account<'info, Config>,
    pub test_usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = writer, space = 8 + Position::INIT_SPACE,
        seeds = [b"position", writer.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub position: Account<'info, Position>,
    #[account(mut, token::mint = test_usdc_mint, token::authority = writer,
        token::token_program = token_program)]
    pub writer_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(init, payer = writer, associated_token::mint = test_usdc_mint,
        associated_token::authority = position, associated_token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyOffer<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump,
        has_one = test_usdc_mint)]
    pub config: Account<'info, Config>,
    pub test_usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, seeds = [b"position", position.writer.as_ref(),
        &position.nonce.to_le_bytes()], bump = position.bump,
        has_one = config)]
    pub position: Account<'info, Position>,
    #[account(mut, token::mint = test_usdc_mint, token::authority = buyer,
        token::token_program = token_program)]
    pub buyer_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = test_usdc_mint, token::authority = position.writer,
        token::token_program = token_program)]
    pub writer_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(associated_token::mint = test_usdc_mint, associated_token::authority = position,
        associated_token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct PublishMockExpiry<'info> {
    pub reporter: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = config)]
    pub position: Account<'info, Position>,
}

#[derive(Accounts)]
pub struct SettleMock<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = test_usdc_mint)]
    pub config: Account<'info, Config>,
    pub test_usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, seeds = [b"position", position.writer.as_ref(),
        &position.nonce.to_le_bytes()], bump = position.bump, has_one = config)]
    pub position: Account<'info, Position>,
    #[account(mut, token::mint = test_usdc_mint, token::authority = position.buyer,
        token::token_program = token_program)]
    pub buyer_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = test_usdc_mint, token::authority = position.writer,
        token::token_program = token_program)]
    pub writer_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = test_usdc_mint,
        associated_token::authority = position, associated_token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = position.writer)]
    /// CHECK: only destination for reclaimed token-account rent; matches stored writer
    pub writer: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct WriterRefund<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = test_usdc_mint)]
    pub config: Account<'info, Config>,
    pub test_usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, seeds = [b"position", position.writer.as_ref(),
        &position.nonce.to_le_bytes()], bump = position.bump, has_one = config)]
    pub position: Account<'info, Position>,
    #[account(mut, address = position.writer)]
    /// CHECK: writer may be non-signing for timeout refund, constrained to stored writer
    pub writer: UncheckedAccount<'info>,
    #[account(mut, token::mint = test_usdc_mint, token::authority = position.writer,
        token::token_program = token_program)]
    pub writer_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = test_usdc_mint,
        token::token_program = token_program)]
    pub buyer_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = test_usdc_mint,
        associated_token::authority = position, associated_token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum DevnetError {
    #[msg("Only test collateral and mock prices permitted")]
    InvalidTerms,
    #[msg("Invalid option type")]
    InvalidSide,
    #[msg("Invalid underlying token")]
    InvalidUnderlying,
    #[msg("Token decimals unsupported")]
    InvalidDecimals,
    #[msg("Invalid expiry")]
    InvalidExpiry,
    #[msg("Unexpected option state")]
    InvalidPhase,
    #[msg("Option expired")]
    Expired,
    #[msg("Buyer and writer cannot be the same account")]
    SelfTrade,
    #[msg("Vault has less than required collateral")]
    VaultNotFunded,
    #[msg("Only authorized mock price signer may publish")]
    NotOracle,
    #[msg("Expiry has not been reached")]
    NotExpired,
    #[msg("Mock expiry price time window unavailable")]
    PriceDeadline,
    #[msg("Payout integer arithmetic overflow")]
    MathOverflow,
    #[msg("Invalid mock oracle authority")]
    InvalidOracle,
    #[msg("Only the writer can cancel an unsold offer")]
    WriterMustSign,
    #[msg("Refund destination is not owned by option buyer")]
    IncorrectBuyerRefund,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn call_is_capped_to_locked_test_collateral() {
        // 100,000 tokens at 6 decimals; 0.002 strike, 0.005 expiry.
        assert_eq!(capped_payout(0, 2_000_000_000, 5_000_000_000,
            100_000_000_000, 6, 100_000_000).unwrap(), 100_000_000);
    }

    #[test]
    fn call_out_of_money_is_zero() {
        assert_eq!(capped_payout(0, 2_000_000_000, 1_000_000_000,
            100_000_000_000, 6, 100_000_000).unwrap(), 0);
    }

    #[test]
    fn put_pays_exact_usdc_micro_units() {
        assert_eq!(capped_payout(1, 2_000_000_000, 500_000_000,
            100_000_000_000, 6, 500_000_000).unwrap(), 150_000_000);
    }

    #[test]
    fn overflow_cannot_silently_wrap_or_overpay() {
        assert!(capped_payout(0, 0, u64::MAX,
            u64::MAX, 0, u64::MAX).is_err()); // fail on u128 overflow
        assert!(capped_payout(2, 1, 2, 1, 6, 1).is_err());
    }
}
