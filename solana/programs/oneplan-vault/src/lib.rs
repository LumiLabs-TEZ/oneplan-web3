pub mod constants;
pub mod error;
pub mod instructions;
pub mod invariant;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL");

#[program]
pub mod oneplan_vault {
    use super::*;

    pub fn init_vault(
        ctx: Context<InitVault>,
        trip_id: u64,
        threshold: u64,
        daily_limit: u64,
    ) -> Result<()> {
        crate::instructions::init_vault::handle_init_vault(ctx, trip_id, threshold, daily_limit)
    }

    pub fn add_member(ctx: Context<AddMember>) -> Result<()> {
        crate::instructions::member::handle_add_member(ctx)
    }

    /// Marks a member as an approver (HOST / CO_HOST), or takes it away.
    /// Server-signed: who may approve is a trip decision the app owns.
    pub fn set_member_role(ctx: Context<SetMemberRole>, role: u8) -> Result<()> {
        crate::instructions::member::handle_set_member_role(ctx, role)
    }

    pub fn deactivate_member(ctx: Context<DeactivateMember>) -> Result<()> {
        crate::instructions::member::handle_deactivate_member(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        crate::instructions::deposit::handle_deposit(ctx, amount)
    }

    pub fn spend(ctx: Context<Spend>, amount: u64) -> Result<()> {
        crate::instructions::spend::handle_spend(ctx, amount)
    }

    pub fn revert_spend(ctx: Context<RevertSpend>, amount: u64) -> Result<()> {
        crate::instructions::spend::handle_revert_spend(ctx, amount)
    }

    pub fn propose_spend(ctx: Context<ProposeSpend>, amount: u64) -> Result<()> {
        crate::instructions::proposal::handle_propose_spend(ctx, amount)
    }

    pub fn approve_spend(ctx: Context<ApproveSpend>) -> Result<()> {
        crate::instructions::proposal::handle_approve_spend(ctx)
    }

    pub fn cancel_spend(ctx: Context<CancelSpend>) -> Result<()> {
        crate::instructions::proposal::handle_cancel_spend(ctx)
    }

    pub fn execute_settlement<'info>(
        ctx: Context<'info, ExecuteSettlement<'info>>,
        payouts: Vec<Payout>,
    ) -> Result<()> {
        crate::instructions::settle::handle_execute_settlement(ctx, payouts)
    }

    /// Mid-trip leave payout: transfer USDC to one member and deactivate them.
    /// Does not close the vault.
    pub fn payout_leave(ctx: Context<PayoutLeave>, amount: u64) -> Result<()> {
        crate::instructions::settle::handle_payout_leave(ctx, amount)
    }

    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        crate::instructions::settle::handle_close_vault(ctx)
    }
}
