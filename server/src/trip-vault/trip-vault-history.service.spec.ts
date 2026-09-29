import { VaultTxKind, VaultTxSource } from '@prisma/client';

import { TripVaultHistoryService } from './trip-vault-history.service';

describe('TripVaultHistoryService.getHistory forUserId', () => {
  const HUY = 1;
  const BORON = 2;
  const TRIP_ID = 10;

  function build(rows: Array<Record<string, unknown>>) {
    const prisma = {
      vaultTransaction: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
      tripMember: {
        count: jest.fn().mockResolvedValue(2),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: HUY, displayName: 'Huy', avatarUrl: null },
          { id: BORON, displayName: 'Boron', avatarUrl: null },
        ]),
      },
      walletAccount: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const vaultService = {
      requireVault: jest.fn().mockResolvedValue({ id: 99 }),
    };
    const service = new TripVaultHistoryService(
      prisma as any,
      vaultService as any,
    );
    return { service, prisma };
  }

  function row(
    overrides: Partial<{
      id: number;
      kind: VaultTxKind;
      source: VaultTxSource;
      userId: number | null;
      shareWithUserIds: number[];
      expenseName: string;
      signature: string | null;
      failureCode: string | null;
      status: string;
    }>,
  ) {
    return {
      id: overrides.id ?? 1,
      kind: overrides.kind ?? VaultTxKind.SPEND,
      source: overrides.source ?? VaultTxSource.VAULT,
      status: overrides.status ?? 'CONFIRMED',
      proposalPda: null,
      approvedAt: null,
      userId: overrides.userId ?? null,
      user: overrides.userId
        ? { id: overrides.userId, displayName: 'X', avatarUrl: null }
        : null,
      shareWithUserIds: overrides.shareWithUserIds ?? [],
      amountMicro: 1_000_000n,
      amountVnd: 20_000n,
      expenseName: overrides.expenseName ?? 'Item',
      expenseCategory: 'FOOD',
      signature:
        overrides.signature === undefined ? 'sig' : overrides.signature,
      failureCode: overrides.failureCode ?? null,
      createdAt: new Date('2026-08-19T00:00:00.000Z'),
      expense: null,
    };
  }

  it('hides another member deposit and Huy-only spend from Boron', async () => {
    const { service } = build([
      row({
        id: 1,
        kind: VaultTxKind.SPEND,
        userId: HUY,
        shareWithUserIds: [HUY],
        expenseName: 'Breakfast',
      }),
      row({
        id: 2,
        kind: VaultTxKind.SPEND,
        userId: HUY,
        shareWithUserIds: [],
        expenseName: 'Coffee',
      }),
      row({
        id: 3,
        kind: VaultTxKind.DEPOSIT,
        userId: HUY,
        expenseName: 'Deposit',
      }),
      row({
        id: 4,
        kind: VaultTxKind.DEPOSIT,
        userId: BORON,
        expenseName: 'Deposit',
      }),
    ]);

    const history = await service.getHistory(TRIP_ID, BORON);
    expect(history.map((e) => e.id)).toEqual([2, 4]);
  });

  it('keeps Huy-only breakfast on Huy review', async () => {
    const { service } = build([
      row({
        id: 1,
        kind: VaultTxKind.SPEND,
        userId: HUY,
        shareWithUserIds: [HUY],
        expenseName: 'Breakfast',
      }),
    ]);

    const history = await service.getHistory(TRIP_ID, HUY);
    expect(history.map((e) => e.id)).toEqual([1]);
  });

  it('hides Huy-only spend from Boron even when Boron submitted the pay', async () => {
    const { service } = build([
      row({
        id: 1,
        kind: VaultTxKind.SPEND,
        userId: BORON,
        shareWithUserIds: [HUY],
        expenseName: 'Coffee',
      }),
    ]);

    const history = await service.getHistory(TRIP_ID, BORON);
    expect(history.map((e) => e.id)).toEqual([]);
  });

  it('names the payer only when the money came from their own wallet', async () => {
    const { service } = build([
      row({
        id: 1,
        kind: VaultTxKind.SPEND,
        userId: HUY,
        shareWithUserIds: [],
      }),
      row({
        id: 2,
        kind: VaultTxKind.SPEND,
        source: VaultTxSource.PERSONAL,
        userId: HUY,
        shareWithUserIds: [],
      }),
    ]);

    const history = await service.getHistory(TRIP_ID);
    expect(history.find((e) => e.id === 1)!.paidBy).toBeNull();
    expect(history.find((e) => e.id === 2)!.paidBy).toEqual(
      expect.objectContaining({ userId: HUY }),
    );
  });

  it('shows the payer their own personal spend even when not in the split', async () => {
    const { service } = build([
      row({
        id: 1,
        kind: VaultTxKind.SPEND,
        source: VaultTxSource.PERSONAL,
        userId: BORON,
        shareWithUserIds: [HUY],
        expenseName: 'Coffee',
      }),
    ]);

    const history = await service.getHistory(TRIP_ID, BORON);
    expect(history.map((e) => e.id)).toEqual([1]);
  });

  // Written before the client signs, so a wallet error leaves it behind with
  // nothing on chain. It used to render as money spent.
  it('hides a spend that never reached the chain', async () => {
    const { service } = build([
      row({ id: 1, status: 'PENDING', signature: null }),
      row({
        id: 2,
        status: 'FAILED',
        signature: null,
        failureCode: 'abandoned',
      }),
      row({ id: 3, status: 'CONFIRMED', signature: 'sig' }),
    ]);

    const history = await service.getHistory(TRIP_ID);
    expect(history.map((e) => e.id)).toEqual([3]);
  });

  it('without forUserId returns the full ledger', async () => {
    const { service } = build([
      row({ id: 1, kind: VaultTxKind.DEPOSIT, userId: HUY }),
      row({ id: 2, kind: VaultTxKind.DEPOSIT, userId: BORON }),
    ]);

    const history = await service.getHistory(TRIP_ID);
    expect(history.map((e) => e.id)).toEqual([1, 2]);
  });
});
