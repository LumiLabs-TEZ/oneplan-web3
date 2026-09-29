import {
  ExpenseCategory,
  VaultTxKind,
  VaultTxSource,
  VaultTxStatus,
} from '@prisma/client';
import { Keypair } from '@solana/web3.js';

import { TripVaultReconcileService } from './trip-vault-reconcile.service';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tripVaultId: 1,
    userId: 7,
    kind: VaultTxKind.SPEND,
    source: VaultTxSource.VAULT,
    status: VaultTxStatus.PENDING,
    amountMicro: 7_660_000n,
    amountVnd: 200_000n,
    bankBin: '970412',
    bankAccount: '109000636588',
    payoutRef: 'vault-tx-1',
    payoutStatus: null,
    signature: 'sig',
    failureCode: null,
    expenseName: 'Coffee',
    expenseCategory: ExpenseCategory.COFFEE,
    shareWithUserIds: [7, 8],
    createdAt: new Date(Date.now() - 10 * 60_000),
    ...overrides,
  };
}

/**
 * The service runs five independent queries in order. Each test supplies the
 * rows for the branch it exercises and empty arrays for the rest.
 */
function deps(
  branches: {
    broadcastDeposits?: unknown[];
    missingPayout?: unknown[];
    pending?: unknown[];
    toRevert?: unknown[];
  } = {},
) {
  const findMany = jest
    .fn()
    .mockResolvedValueOnce(branches.broadcastDeposits ?? [])
    .mockResolvedValueOnce(branches.missingPayout ?? [])
    .mockResolvedValueOnce(branches.pending ?? [])
    .mockResolvedValueOnce(branches.toRevert ?? [])
    .mockResolvedValue([]);

  const prisma = {
    vaultTransaction: {
      findMany,
      update: jest.fn(),
      // 0 rows for the unsigned-spend sweep; claiming a payout (-> SENDING)
      // succeeds unless a test says another submit got there first.
      updateMany: jest
        .fn()
        .mockImplementation((args: { data?: { payoutStatus?: string } }) =>
          Promise.resolve({
            count: args.data?.payoutStatus === 'SENDING' ? 1 : 0,
          }),
        ),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    walletAccount: {
      findUnique: jest.fn().mockResolvedValue({
        publicKey: Keypair.generate().publicKey.toBase58(),
      }),
    },
    tripVault: {
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        tripId: 42,
        vaultPda: Keypair.generate().publicKey.toBase58(),
        usdcAta: Keypair.generate().publicKey.toBase58(),
      }),
    },
  };
  const payout = { payout: jest.fn(), getStatus: jest.fn() };
  const solana = {
    isConfigured: true,
    getTokenBalance: jest.fn().mockResolvedValue(0n),
    revertSpend: jest.fn().mockResolvedValue('revert-sig'),
    refundPersonalSpend: jest.fn().mockResolvedValue('refund-sig'),
    signatureLanded: jest.fn().mockResolvedValue(true),
  };
  const expenses = { createFromVault: jest.fn().mockResolvedValue({ id: 55 }) };
  return { prisma, payout, solana, expenses };
}

function build(d: ReturnType<typeof deps>) {
  return new TripVaultReconcileService(
    d.prisma as never,
    d.payout as never,
    d.solana as never,
    d.expenses as never,
  );
}

describe('TripVaultReconcileService', () => {
  it('sends the payout when the chain leg landed but the fiat leg never started', async () => {
    const d = deps({ missingPayout: [row({ payoutStatus: null })] });
    d.payout.payout.mockResolvedValue({ outcome: 'SUCCESS' });

    const report = await build(d).reconcile();

    expect(d.payout.payout).toHaveBeenCalledWith(
      expect.objectContaining({ reference: 'vault-tx-1' }),
    );
    expect(report.payoutsSent).toBe(1);
  });

  // S7: the cron and a live submit must not both pay and both book the expense.
  it('does not pay a row a live submit has already claimed', async () => {
    const d = deps({ missingPayout: [row({ payoutStatus: null })] });
    d.prisma.vaultTransaction.updateMany.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );

    const report = await build(d).reconcile();

    expect(d.payout.payout).not.toHaveBeenCalled();
    expect(report.payoutsSent).toBe(0);
  });

  it('claims the row before paying, and re-claims a claim that went stale', async () => {
    const d = deps({ missingPayout: [row({ payoutStatus: null })] });
    d.payout.payout.mockResolvedValue({ outcome: 'SUCCESS' });

    await build(d).reconcile();

    expect(d.prisma.vaultTransaction.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 1,
        status: VaultTxStatus.PENDING,
        OR: [
          { payoutStatus: null },
          { payoutStatus: 'SENDING', updatedAt: { lt: expect.any(Date) } },
        ],
      }),
      data: { payoutStatus: 'SENDING' },
    });
    // The finding query looks for never-started AND stale-SENDING rows.
    const [{ where }] = d.prisma.vaultTransaction.findMany.mock.calls[1] as [
      { where: { OR: unknown[] } },
    ];
    expect(where.OR).toContainEqual({ payoutStatus: null });
    expect(where.OR).toContainEqual({
      payoutStatus: 'SENDING',
      updatedAt: { lt: expect.any(Date) },
    });
  });

  it('never asks the provider about a row still being SENDING', async () => {
    const d = deps({ pending: [] });

    await build(d).reconcile();

    const [{ where }] = d.prisma.vaultTransaction.findMany.mock.calls[2] as [
      { where: { AND: unknown[] } },
    ];
    expect(where.AND).toContainEqual({
      payoutStatus: { not: 'SENDING' },
    });
  });

  describe('D3: vault crons idle while web3 is off', () => {
    it.each([
      ['disabled', { isEnabled: false, isConfigured: true }],
      ['not configured', { isEnabled: true, isConfigured: false }],
    ])('does nothing when %s', async (_label, flags) => {
      const d = deps();
      Object.assign(d.solana, flags);
      const service = build(d);
      const spy = jest.spyOn(service, 'reconcile');

      await service.handleCron();

      expect(spy).not.toHaveBeenCalled();
      expect(d.prisma.vaultTransaction.findMany).not.toHaveBeenCalled();
    });

    it('runs when enabled and configured', async () => {
      const d = deps();
      Object.assign(d.solana, { isEnabled: true, isConfigured: true });
      const service = build(d);
      const spy = jest.spyOn(service, 'reconcile');

      await service.handleCron();

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  it('confirms a pending row once the provider reports SUCCESS', async () => {
    const d = deps({ pending: [row({ payoutStatus: 'UNKNOWN' })] });
    d.payout.getStatus.mockResolvedValue('SUCCESS');

    const report = await build(d).reconcile();

    expect(report.confirmed).toBe(1);
    expect(d.expenses.createFromVault).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Coffee',
        category: ExpenseCategory.COFFEE,
        shareWithUserIds: [7, 8],
      }),
    );
    expect(d.solana.revertSpend).not.toHaveBeenCalled();
  });

  it('never reverts while the provider still reports UNKNOWN', async () => {
    const d = deps({ pending: [row({ payoutStatus: 'UNKNOWN' })] });
    d.payout.getStatus.mockResolvedValue('UNKNOWN');

    const report = await build(d).reconcile();

    expect(d.solana.revertSpend).not.toHaveBeenCalled();
    expect(d.expenses.createFromVault).not.toHaveBeenCalled();
    expect(report.reverted).toBe(0);
  });

  it('marks a pending row failed once the provider confirms FAILED', async () => {
    const d = deps({ pending: [row({ payoutStatus: 'UNKNOWN' })] });
    d.payout.getStatus.mockResolvedValue('FAILED');

    await build(d).reconcile();

    const updates = d.prisma.vaultTransaction.update.mock.calls as Array<
      [{ data: { status?: VaultTxStatus } }]
    >;
    expect(
      updates.some(([arg]) => arg.data.status === VaultTxStatus.FAILED),
    ).toBe(true);
    expect(d.expenses.createFromVault).not.toHaveBeenCalled();
  });

  it('reverts only rows already confirmed FAILED', async () => {
    const d = deps({ toRevert: [row({ status: VaultTxStatus.FAILED })] });

    const report = await build(d).reconcile();

    expect(d.solana.revertSpend).toHaveBeenCalled();
    expect(report.reverted).toBe(1);
  });

  // The USDC left the member's wallet, not the vault, so the vault program's
  // revert cannot give it back. The receiver sends it back to the member.
  it('refunds a failed personal spend to the member rather than reverting the vault', async () => {
    const d = deps({
      toRevert: [
        row({ status: VaultTxStatus.FAILED, source: VaultTxSource.PERSONAL }),
      ],
    });

    const report = await build(d).reconcile();

    expect(d.solana.refundPersonalSpend).toHaveBeenCalledWith(
      expect.anything(),
      7_660_000n,
    );
    expect(d.solana.revertSpend).not.toHaveBeenCalled();
    expect(report.reverted).toBe(1);
  });

  it('leaves a failed personal spend alone when the member has no wallet', async () => {
    const d = deps({
      toRevert: [
        row({ status: VaultTxStatus.FAILED, source: VaultTxSource.PERSONAL }),
      ],
    });
    d.prisma.walletAccount.findUnique.mockResolvedValue(null);

    const report = await build(d).reconcile();

    expect(d.solana.refundPersonalSpend).not.toHaveBeenCalled();
    expect(d.prisma.vaultTransaction.update).not.toHaveBeenCalled();
    expect(report.reverted).toBe(0);
  });

  // A cancelled proposal carries the cancel transaction's signature, but no
  // USDC ever left the vault; asking the program to give it back failed on
  // chain every five minutes and took the rest of the job down with it.
  it('never reverts a cancelled proposal', async () => {
    const d = deps();

    await build(d).reconcile();

    const [, , , revertQuery] = d.prisma.vaultTransaction.findMany.mock
      .calls as [{ where: { failureCode: { notIn: string[] } } }][];
    expect(revertQuery[0].where.failureCode.notIn).toEqual(
      expect.arrayContaining(['cancelled', 'REVERTED', 'abandoned']),
    );
  });

  it('keeps going when one revert fails on chain', async () => {
    const d = deps({
      toRevert: [
        row({ id: 1, status: VaultTxStatus.FAILED }),
        row({ id: 2, status: VaultTxStatus.FAILED }),
      ],
    });
    d.solana.revertSpend
      .mockRejectedValueOnce(new Error('Simulation failed'))
      .mockResolvedValueOnce('revert-sig');
    d.prisma.tripVault.findMany.mockResolvedValue([
      { id: 1, tripId: 42, usdcAta: Keypair.generate().publicKey.toBase58() },
    ]);

    const report = await build(d).reconcile();

    expect(report.reverted).toBe(1);
    // The drift check after it still ran.
    expect(d.prisma.vaultTransaction.groupBy).toHaveBeenCalled();
  });

  it('marks a spend the client never signed as abandoned', async () => {
    const d = deps();
    d.prisma.vaultTransaction.updateMany.mockResolvedValue({ count: 1 });

    const report = await build(d).reconcile();

    expect(d.prisma.vaultTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: VaultTxKind.SPEND,
          status: VaultTxStatus.PENDING,
          signature: null,
          proposalPda: null,
        }),
        data: { status: VaultTxStatus.FAILED, failureCode: 'abandoned' },
      }),
    );
    expect(report.abandoned).toBe(1);
  });

  it('measures drift against vault money only', async () => {
    const d = deps();
    d.prisma.tripVault.findMany.mockResolvedValue([
      {
        id: 1,
        tripId: 42,
        usdcAta: Keypair.generate().publicKey.toBase58(),
      },
    ]);

    await build(d).reconcile();

    expect(d.prisma.vaultTransaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: VaultTxSource.VAULT }),
      }),
    );
  });

  it('flags a row stuck PENDING for over thirty minutes', async () => {
    const d = deps({
      pending: [
        row({
          payoutStatus: 'UNKNOWN',
          createdAt: new Date(Date.now() - 45 * 60_000),
        }),
      ],
    });
    d.payout.getStatus.mockResolvedValue('UNKNOWN');

    const report = await build(d).reconcile();

    expect(report.stale).toBe(1);
  });

  it('does nothing at all when Solana is not configured', async () => {
    const d = deps({ missingPayout: [row()] });
    d.solana.isConfigured = false;

    await build(d).handleCron();

    expect(d.payout.payout).not.toHaveBeenCalled();
  });

  it('confirms a deposit whose broadcast answer never came back', async () => {
    const d = deps({
      broadcastDeposits: [
        row({ id: 9, kind: VaultTxKind.DEPOSIT, signature: 'dep-sig' }),
      ],
    });
    d.solana.signatureLanded.mockResolvedValue(true);

    await build(d).reconcile();

    expect(d.solana.signatureLanded).toHaveBeenCalledWith('dep-sig');
    expect(d.prisma.vaultTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: VaultTxStatus.CONFIRMED },
      }),
    );
  });

  // A deposit whose transaction never landed is money the vault does not have.
  // Left PENDING it reads as a contribution nobody can spend.
  it('fails a deposit whose transaction never reached the chain', async () => {
    const d = deps({
      broadcastDeposits: [
        row({ id: 9, kind: VaultTxKind.DEPOSIT, signature: 'dep-sig' }),
      ],
    });
    d.solana.signatureLanded.mockResolvedValue(false);

    await build(d).reconcile();

    expect(d.prisma.vaultTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: VaultTxStatus.FAILED } }),
    );
  });

  // The payout provider takes bank details a deposit does not have, so a
  // deposit reaching that branch would call it with nulls.
  it('never sends a payout for a deposit', async () => {
    const d = deps({
      broadcastDeposits: [
        row({ id: 9, kind: VaultTxKind.DEPOSIT, signature: 'dep-sig' }),
      ],
    });

    await build(d).reconcile();

    expect(d.payout.payout).not.toHaveBeenCalled();
  });
});
