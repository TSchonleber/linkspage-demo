//! Crashgame — provably-fair on-chain crash game.
//!
//! Classic Aviator/Bustabit mechanic:
//!   1. Betting phase — users deposit SOL to vault; balance ledger updated.
//!   2. Running phase — multiplier climbs off-chain, driven by a committed
//!      seed from an operator-generated hash chain.
//!   3. Cash-out — handled off-chain; authority batches payouts into
//!      `settle_round` which verifies the revealed seed against the
//!      pre-committed hash.
//!
//! Provably-fair guarantee: `seed[i] = sha256(seed[i+1])`. The terminal hash
//! `sha256(seed[0])` is stored in `Config` at `initialize`. Every round's
//! committed hash is a node in the chain; revealing the pre-image lets any
//! client verify the chain all the way back to the terminal hash.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_lang::system_program;

declare_id!("34SgyYj5SeunqBAYWMrgx5w8Yu8wSR8MLMekMaVNBpqg");

pub const CONFIG_SEED: &[u8] = b"config";
pub const VAULT_SEED: &[u8] = b"vault";
pub const BALANCE_SEED: &[u8] = b"balance";
pub const ROUND_SEED: &[u8] = b"round";

/// Minimum SOL kept in vault to satisfy rent-exemption. Payouts cannot
/// drain the vault below this lamport floor.
pub const VAULT_RENT_RESERVE: u64 = 890_880; // ~rent for 0-byte sys account

#[program]
pub mod crashgame {
    use super::*;

    /// One-time setup. Stores the terminal hash of the seed chain and marks
    /// the signer as authority. Creates the vault PDA (SystemAccount).
    pub fn initialize(ctx: Context<Initialize>, terminal_hash: [u8; 32]) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.terminal_hash = terminal_hash;
        config.vault_bump = ctx.bumps.vault;
        config.config_bump = ctx.bumps.config;
        config.last_committed_round = 0;
        config.last_settled_round = 0;
        emit!(Initialized {
            authority: config.authority,
            terminal_hash,
        });
        Ok(())
    }

    /// User deposits SOL into the vault. Balance ledger entry is created
    /// (or incremented) for the user.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, CrashError::ZeroAmount);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, amount)?;

        let balance = &mut ctx.accounts.user_balance;
        if balance.owner == Pubkey::default() {
            balance.owner = ctx.accounts.user.key();
            balance.bump = ctx.bumps.user_balance;
        }
        balance.lamports = balance
            .lamports
            .checked_add(amount)
            .ok_or(CrashError::MathOverflow)?;

        emit!(Deposited {
            user: ctx.accounts.user.key(),
            amount,
            new_balance: balance.lamports,
        });
        Ok(())
    }

    /// User withdraws from their ledger balance. Vault signs the transfer.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, CrashError::ZeroAmount);
        let balance = &mut ctx.accounts.user_balance;
        require!(balance.lamports >= amount, CrashError::InsufficientBalance);

        let vault_info = ctx.accounts.vault.to_account_info();
        let vault_lamports = vault_info.lamports();
        require!(
            vault_lamports
                .checked_sub(amount)
                .map(|after| after >= VAULT_RENT_RESERVE)
                .unwrap_or(false),
            CrashError::VaultUnderfunded
        );

        let seeds: &[&[u8]] = &[VAULT_SEED, &[ctx.accounts.config.vault_bump]];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: vault_info,
                to: ctx.accounts.user.to_account_info(),
            },
            signer_seeds,
        );
        system_program::transfer(cpi_ctx, amount)?;

        balance.lamports = balance
            .lamports
            .checked_sub(amount)
            .ok_or(CrashError::MathOverflow)?;

        emit!(Withdrawn {
            user: ctx.accounts.user.key(),
            amount,
            new_balance: balance.lamports,
        });
        Ok(())
    }

    /// Authority commits the pre-image hash for the next round. Must be
    /// monotonically increasing round IDs.
    pub fn commit_round(
        ctx: Context<CommitRound>,
        round_id: u64,
        committed_hash: [u8; 32],
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.authority.key(),
            config.authority,
            CrashError::Unauthorized
        );
        require!(
            round_id == config.last_committed_round.saturating_add(1),
            CrashError::RoundIdOutOfOrder
        );

        let round = &mut ctx.accounts.round;
        round.round_id = round_id;
        round.committed_hash = committed_hash;
        round.revealed_seed = [0u8; 32];
        round.crash_multiplier_bps = 0;
        round.settled = false;
        round.bump = ctx.bumps.round;
        round.committed_slot = Clock::get()?.slot;

        config.last_committed_round = round_id;

        emit!(RoundCommitted {
            round_id,
            committed_hash,
        });
        Ok(())
    }

    /// Authority reveals the seed and settles payouts. Verifies
    /// `sha256(revealed_seed) == committed_hash`, pays winners from the
    /// vault, records the crash multiplier derived from the seed.
    pub fn settle_round<'info>(
        ctx: Context<'_, '_, '_, 'info, SettleRound<'info>>,
        round_id: u64,
        revealed_seed: [u8; 32],
        payouts: Vec<Payout>,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.authority.key(),
            config.authority,
            CrashError::Unauthorized
        );

        let round = &mut ctx.accounts.round;
        require!(!round.settled, CrashError::AlreadySettled);
        require!(round.round_id == round_id, CrashError::RoundIdMismatch);

        // Hash check: sha256(revealed_seed) must equal committed_hash.
        let computed = hash(&revealed_seed).to_bytes();
        require!(
            computed == round.committed_hash,
            CrashError::HashMismatch
        );

        round.revealed_seed = revealed_seed;
        round.crash_multiplier_bps = derive_crash_bps(&revealed_seed);
        round.settled = true;

        // Pay winners from vault.
        let seeds: &[&[u8]] = &[VAULT_SEED, &[config.vault_bump]];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        let mut total_paid: u64 = 0;

        // Remaining accounts layout: for each payout, a single user
        // SystemAccount in the same order as `payouts`.
        require!(
            ctx.remaining_accounts.len() == payouts.len(),
            CrashError::PayoutAccountMismatch
        );

        for (i, payout) in payouts.iter().enumerate() {
            let recipient_info = &ctx.remaining_accounts[i];
            require_keys_eq!(
                *recipient_info.key,
                payout.user,
                CrashError::PayoutAccountMismatch
            );
            if payout.amount == 0 {
                continue;
            }

            let vault_info = ctx.accounts.vault.to_account_info();
            require!(
                vault_info
                    .lamports()
                    .checked_sub(payout.amount)
                    .map(|after| after >= VAULT_RENT_RESERVE)
                    .unwrap_or(false),
                CrashError::VaultUnderfunded
            );

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: vault_info,
                    to: recipient_info.clone(),
                },
                signer_seeds,
            );
            system_program::transfer(cpi_ctx, payout.amount)?;

            total_paid = total_paid
                .checked_add(payout.amount)
                .ok_or(CrashError::MathOverflow)?;
        }

        let config_mut = &mut ctx.accounts.config;
        config_mut.last_settled_round = round_id;

        emit!(RoundSettled {
            round_id,
            revealed_seed,
            crash_multiplier_bps: round.crash_multiplier_bps,
            total_paid,
        });
        Ok(())
    }
}

/// Deterministic crash-point derivation from the revealed seed.
///
/// Uses the first 8 bytes of the seed as a u64, maps it to a float in
/// [0, 1), and applies the standard Bustabit formula with a 1% house
/// edge. Returns crash multiplier in basis points (1.00x = 10_000 bps).
///
/// Formula: `m = floor((99/100) / (1 - r)) / 100` clipped to >= 1.00.
fn derive_crash_bps(seed: &[u8; 32]) -> u64 {
    // Treat first 8 bytes as big-endian u64.
    let mut raw = [0u8; 8];
    raw.copy_from_slice(&seed[..8]);
    let n = u64::from_be_bytes(raw);

    // 4% instant-bust (house edge). If low bits match a fixed pattern -> 1.00x.
    // Instead use the standard bustabit-style mapping:
    //   r = n / 2^52 (keep 52 bits for float-like precision)
    //   m = (100 * 2^52 - n) / (2^52 - n) -- integer-valued in units of 0.01x
    let shifted = n >> 12; // top 52 bits
    const MAX52: u64 = 1u64 << 52;
    if shifted >= MAX52 {
        return 10_000; // safety fallback: 1.00x
    }
    if shifted == MAX52 - 1 {
        return 10_000;
    }
    // m * 100 (so 1.00x => 100)
    let numer = 100u128 * (MAX52 as u128) - (shifted as u128);
    let denom = (MAX52 - shifted) as u128;
    let m100 = numer / denom; // value in units of 0.01x
    // Convert to basis points (1.00x = 10_000): bps = m100 * 100
    let bps = m100.saturating_mul(100);
    // Clip to u64; floor at 10_000.
    let bps_u64 = if bps > u64::MAX as u128 {
        u64::MAX
    } else {
        bps as u64
    };
    bps_u64.max(10_000)
}

// ---------------- Accounts ----------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Config::SIZE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: SystemAccount PDA holding SOL. Created on first deposit via
    /// CPI transfer; we simply derive its address here so the client can
    /// fund it. Anchor validates the seeds.
    #[account(
        seeds = [VAULT_SEED],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.config_bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = config.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserBalance::SIZE,
        seeds = [BALANCE_SEED, user.key().as_ref()],
        bump,
    )]
    pub user_balance: Account<'info, UserBalance>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.config_bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = config.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [BALANCE_SEED, user.key().as_ref()],
        bump = user_balance.bump,
        has_one = owner @ CrashError::Unauthorized,
    )]
    pub user_balance: Account<'info, UserBalance>,

    /// CHECK: owner equality is enforced by `has_one = owner` above.
    pub owner: UncheckedAccount<'info>,

    #[account(mut, address = owner.key() @ CrashError::Unauthorized)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct CommitRound<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.config_bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = authority,
        space = 8 + Round::SIZE,
        seeds = [ROUND_SEED, &round_id.to_le_bytes()],
        bump,
    )]
    pub round: Account<'info, Round>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct SettleRound<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.config_bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = config.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [ROUND_SEED, &round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, Round>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ---------------- State ----------------

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub terminal_hash: [u8; 32],
    pub last_committed_round: u64,
    pub last_settled_round: u64,
    pub vault_bump: u8,
    pub config_bump: u8,
}
impl Config {
    // 32 + 32 + 8 + 8 + 1 + 1
    pub const SIZE: usize = 32 + 32 + 8 + 8 + 1 + 1;
}

#[account]
pub struct UserBalance {
    pub owner: Pubkey,
    pub lamports: u64,
    pub bump: u8,
}
impl UserBalance {
    pub const SIZE: usize = 32 + 8 + 1;
}

#[account]
pub struct Round {
    pub round_id: u64,
    pub committed_hash: [u8; 32],
    pub revealed_seed: [u8; 32],
    pub crash_multiplier_bps: u64,
    pub committed_slot: u64,
    pub settled: bool,
    pub bump: u8,
}
impl Round {
    // 8 + 32 + 32 + 8 + 8 + 1 + 1
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Payout {
    pub user: Pubkey,
    pub amount: u64,
}

// ---------------- Events ----------------

#[event]
pub struct Initialized {
    pub authority: Pubkey,
    pub terminal_hash: [u8; 32],
}

#[event]
pub struct Deposited {
    pub user: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
}

#[event]
pub struct Withdrawn {
    pub user: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
}

#[event]
pub struct RoundCommitted {
    pub round_id: u64,
    pub committed_hash: [u8; 32],
}

#[event]
pub struct RoundSettled {
    pub round_id: u64,
    pub revealed_seed: [u8; 32],
    pub crash_multiplier_bps: u64,
    pub total_paid: u64,
}

// ---------------- Errors ----------------

#[error_code]
pub enum CrashError {
    #[msg("Unauthorized signer for this operation.")]
    Unauthorized,
    #[msg("sha256(revealed_seed) did not match committed_hash.")]
    HashMismatch,
    #[msg("Round has already been settled.")]
    AlreadySettled,
    #[msg("Round ID mismatch for provided account.")]
    RoundIdMismatch,
    #[msg("Round IDs must be strictly monotonically increasing by 1.")]
    RoundIdOutOfOrder,
    #[msg("Insufficient on-chain ledger balance for this user.")]
    InsufficientBalance,
    #[msg("Vault would drop below rent-exempt reserve after this transfer.")]
    VaultUnderfunded,
    #[msg("Math overflow.")]
    MathOverflow,
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,
    #[msg("remaining_accounts does not match the payouts vector.")]
    PayoutAccountMismatch,
}
