import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  ExpenseCategory,
  VaultStatus,
  VaultTransaction,
  VaultTxKind,
  VaultTxSource,
  VaultTxStatus,
} from '@prisma/client';
import { PublicKey } from '@solana/web3.js';

import { PrismaService } from '../prisma/prisma.service';
import { SolanaService } from '../solana/solana.service';
import { PAYOUT_PROVIDER } from '../payout/payout-provider.interface';
import type { PayoutProvider } from '../payout/payout-provider.interface';
import { ExpensesService } from '../expenses/expenses.service';
import { PAYOUT_SENDING } from './payout-claim';
import {
  FAILURE_CODES_WITHOUT_TRANSFER,
  VAULT_FAILURE_CODES,
} from './vault-failure-codes';

export interface ReconcileReport {
  payoutsSent: number;
  confirmed: number;
  reverted: number;
  abandoned: number;
  stale: number;
  drift: number;
}

const PENDING_GRACE_MS = 2 * 60_000;
const STALE_ALERT_MS = 30 * 60_000;
const BATCH = 50;

/**
 * The safety net behind every payment. Each branch exists because the process
 * can die between the on-chain leg and the fiat leg, or because the provider can
 * be ambiguous about whether money actually moved.
 */
@Injectable()
export class TripVaultReconcileService {
  private readonly logger = new Logger(TripVaultReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYOUT_PROVIDER) private readonly payout: PayoutProvider,
    private readonly solana: SolanaService,
    private readonly expenses: ExpensesService,
  ) {}

  @Cron('*/5 * * * *')
  async handleCron(): Promise<void> {
    if (!this.solana.isEnabled || !this.solana.isConfigured) {
      return;
    }
    try {
      const report = await this.reconcile();
      if (report.stale > 0 || report.drift > 0) {
        this.logger.warn(`reconcile: ${JSON.stringify(report)}`);
      }
    } catch (error) {
      // The scheduler attaches no handler, so a rejection here became an
      // unhandled rejection and took the whole process down with it — a
      // rate-limited RPC read killed the API for every client. This pass runs
      // again in five minutes; one failure is a thing to log, not to die of.
      this.logger.error(`reconcile failed: ${error}`);
    }
  }

  async reconcile(): Promise<ReconcileReport> {
    const report: ReconcileReport = {
      payoutsSent: 0,
      confirmed: 0,
      reverted: 0,
      abandoned: 0,
      stale: 0,
      drift: 0,
    };

    // Each step on its own. One row the chain refuses used to stop every
    // step after it, so a single bad revert silenced the drift check for
    // weeks.
    await this.step('settleBroadcastDeposits', () =>
      this.settleBroadcastDeposits(report),
    );
    await this.step('expireUnsignedSpends', () =>
      this.expireUnsignedSpends(report),
    );
    await this.step('sendMissingPayouts', () =>
      this.sendMissingPayouts(report),
    );
    await this.step('resolvePending', () => this.resolvePending(report));
    await this.step('revertConfirmedFailures', () =>
      this.revertConfirmedFailures(report),
    );
    await this.step('checkDrift', () => this.checkDrift(report));

    return report;
  }

  private async step(name: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`reconcile step ${name} failed: ${String(error)}`);
    }
  }

  /**
   * A spend the client never signed.
   *
   * The row is written before the signature is asked for, so a verification
   * failure or a closed app leaves it PENDING with nothing on chain. Nothing
   * else here would ever pick it up, and history was showing it as money
   * spent. After the grace period it is marked abandoned; there is nothing to
   * revert.
   */
  private async expireUnsignedSpends(report: ReconcileReport): Promise<void> {
    const result = await this.prisma.vaultTransaction.updateMany({
      where: {
        kind: VaultTxKind.SPEND,
        status: VaultTxStatus.PENDING,
        signature: null,
        payoutStatus: null,
        proposalPda: null,
        createdAt: { lt: new Date(Date.now() - PENDING_GRACE_MS) },
      },
      data: {
        status: VaultTxStatus.FAILED,
        failureCode: VAULT_FAILURE_CODES.abandoned,
      },
    });
    report.abandoned += result.count;
  }

  /**
   * A deposit was broadcast and the answer never came back.
   *
   * The signature is the whole point of writing the row before confirming: the
   * chain knows what happened to it, so this asks rather than guesses. A
   * deposit that never landed is marked failed rather than left to look like
   * money the vault is holding.
   */
  private async settleBroadcastDeposits(
    report: ReconcileReport,
  ): Promise<void> {
    const rows = await this.prisma.vaultTransaction.findMany({
      where: {
        kind: VaultTxKind.DEPOSIT,
        status: VaultTxStatus.PENDING,
        signature: { not: null },
        createdAt: { lt: new Date(Date.now() - PENDING_GRACE_MS) },
      },
      take: BATCH,
    });

    for (const row of rows) {
      const landed = await this.solana.signatureLanded(row.signature!);
      await this.prisma.vaultTransaction.update({
        where: { id: row.id },
        data: {
          status: landed ? VaultTxStatus.CONFIRMED : VaultTxStatus.FAILED,
        },
      });
      report.confirmed += landed ? 1 : 0;
    }
  }

  /** A. The chain leg landed but the fiat leg never started. */
  private async sendMissingPayouts(report: ReconcileReport): Promise<void> {
    const staleClaim = new Date(Date.now() - PENDING_GRACE_MS);
    const rows = await this.prisma.vaultTransaction.findMany({
      where: {
        // Only a spend pays a merchant. A deposit now reaches PENDING with a
        // signature too, and it has no bank details to pay to.
        kind: VaultTxKind.SPEND,
        status: VaultTxStatus.PENDING,
        signature: { not: null },
        // Never started, or claimed by a submit that died before it finished.
        OR: [
          { payoutStatus: null },
          { payoutStatus: PAYOUT_SENDING, updatedAt: { lt: staleClaim } },
        ],
        // A proposal carries a signature from the moment it is created, but no
        // money has moved until a second member approves it. Without this the
        // job would pay a merchant for a spend still sitting in the vault.
        AND: [{ OR: [{ proposalPda: null }, { approvedAt: { not: null } }] }],
      },
      take: BATCH,
    });

    for (const row of rows) {
      // Claim it, as submitPayment does, so the two cannot both pay and both
      // create the expense. Re-claiming a stale SENDING row bumps updatedAt.
      const claim = await this.prisma.vaultTransaction.updateMany({
        where: {
          id: row.id,
          status: VaultTxStatus.PENDING,
          OR: [
            { payoutStatus: null },
            { payoutStatus: PAYOUT_SENDING, updatedAt: { lt: staleClaim } },
          ],
        },
        data: { payoutStatus: PAYOUT_SENDING },
      });
      if (claim.count === 0) {
        continue;
      }
      const result = await this.payout.payout({
        bankBin: row.bankBin!,
        accountNumber: row.bankAccount!,
        amountVnd: row.amountVnd!,
        reference: row.payoutRef!,
      });
      await this.prisma.vaultTransaction.update({
        where: { id: row.id },
        data: { payoutStatus: result.outcome },
      });
      report.payoutsSent += 1;
    }
  }

  /**
   * B. Pending long enough that the provider should have an answer.
   *
   * UNKNOWN is deliberately inert here: reverting a payout that actually went
   * through would pay the merchant and refund the vault, losing the money twice.
   */
  private async resolvePending(report: ReconcileReport): Promise<void> {
    const rows = await this.prisma.vaultTransaction.findMany({
      where: {
        status: VaultTxStatus.PENDING,
        // SENDING is a submit (or sendMissingPayouts) still working on it; the
        // provider has no answer to give yet.
        AND: [
          { payoutStatus: { not: null } },
          { payoutStatus: { not: PAYOUT_SENDING } },
        ],
        createdAt: { lt: new Date(Date.now() - PENDING_GRACE_MS) },
      },
      take: BATCH,
    });

    for (const row of rows) {
      const outcome = await this.payout.getStatus(row.payoutRef!);

      if (outcome === 'SUCCESS') {
        const vault = await this.prisma.tripVault.findUniqueOrThrow({
          where: { id: row.tripVaultId },
          select: { tripId: true },
        });
        const expense = await this.expenses.createFromVault({
          tripId: vault.tripId,
          paidByUserId: row.userId ?? undefined,
          amountVnd: row.amountVnd!,
          amountUsdcMicro: row.amountMicro,
          rate: row.rate,
          name: row.expenseName ?? 'Vault payment',
          category: row.expenseCategory ?? ExpenseCategory.OTHER,
          shareWithUserIds: row.shareWithUserIds,
        });
        await this.prisma.vaultTransaction.update({
          where: { id: row.id },
          data: {
            status: VaultTxStatus.CONFIRMED,
            payoutStatus: outcome,
            expenseId: expense.id,
          },
        });
        report.confirmed += 1;
        continue;
      }

      if (outcome === 'FAILED') {
        await this.prisma.vaultTransaction.update({
          where: { id: row.id },
          data: { status: VaultTxStatus.FAILED, payoutStatus: outcome },
        });
        continue;
      }

      if (Date.now() - row.createdAt.getTime() > STALE_ALERT_MS) {
        report.stale += 1;
      }
    }
  }

  /** C. Confirmed failures whose on-chain transfer still needs undoing. */
  private async revertConfirmedFailures(
    report: ReconcileReport,
  ): Promise<void> {
    const rows = await this.prisma.vaultTransaction.findMany({
      where: {
        status: VaultTxStatus.FAILED,
        signature: { not: null },
        // A cancelled proposal carries the cancel transaction's signature but
        // moved no USDC; asking the program to give it back fails on chain.
        failureCode: { notIn: FAILURE_CODES_WITHOUT_TRANSFER },
      },
      take: BATCH,
    });

    for (const row of rows) {
      try {
        await this.revertOne(row);
        report.reverted += 1;
      } catch (error) {
        // The next row may well be fine; this one is logged and retried on
        // the next tick.
        this.logger.error(
          `revert of vault tx ${row.id} failed: ${String(error)}`,
        );
      }
    }
  }

  private async revertOne(row: VaultTransaction): Promise<void> {
    if (row.source === VaultTxSource.PERSONAL) {
      // The money came from the member, not the vault, so it goes back to
      // the member. Without a wallet on file there is nowhere to send it and
      // the row stays FAILED for someone to look at.
      const wallet = row.userId
        ? await this.prisma.walletAccount.findUnique({
            where: { userId: row.userId },
          })
        : null;
      if (!wallet) {
        throw new Error(
          `personal spend ${row.id} failed but user ${row.userId} has no wallet; refund by hand`,
        );
      }
      await this.solana.refundPersonalSpend(
        new PublicKey(wallet.publicKey),
        row.amountMicro,
      );
    } else {
      const vault = await this.prisma.tripVault.findUniqueOrThrow({
        where: { id: row.tripVaultId },
        select: { vaultPda: true },
      });
      await this.solana.revertSpend(
        new PublicKey(vault.vaultPda),
        row.amountMicro,
      );
    }
    await this.prisma.vaultTransaction.update({
      where: { id: row.id },
      data: { failureCode: VAULT_FAILURE_CODES.reverted },
    });
  }

  /**
   * D. Mirror versus chain. The last net, catching anything the specific
   * branches missed: the vault balance must equal deposits minus confirmed
   * spends.
   */
  private async checkDrift(report: ReconcileReport): Promise<void> {
    const vaults = await this.prisma.tripVault.findMany({
      where: { status: VaultStatus.ACTIVE },
      take: 200,
    });

    for (const vault of vaults) {
      try {
        const onChain = await this.solana.getTokenBalance(
          new PublicKey(vault.usdcAta),
        );
        // Personal spends never passed through the vault, so they are not
        // part of what its balance should be.
        const totals = await this.prisma.vaultTransaction.groupBy({
          by: ['kind'],
          where: {
            tripVaultId: vault.id,
            status: VaultTxStatus.CONFIRMED,
            source: VaultTxSource.VAULT,
          },
          _sum: { amountMicro: true },
        });

        let expected = 0n;
        for (const t of totals) {
          const sum = t._sum.amountMicro ?? 0n;
          expected += t.kind === 'DEPOSIT' ? sum : -sum;
        }

        if (expected !== onChain) {
          this.logger.warn(
            `vault ${vault.tripId} drift: mirror ${expected} vs chain ${onChain}`,
          );
          report.drift += 1;
        }
      } catch (error) {
        this.logger.warn(
          `vault ${vault.tripId} balance unreadable: ${String(error)}`,
        );
        report.drift += 1;
      }
    }
  }
}
