import { Keypair } from '@solana/web3.js';
import BN from 'bn.js';

import { TripVaultSettlementService } from './trip-vault-settlement.service';
import { VaultTxKind, VaultTxSource, VaultTxStatus } from '@prisma/client';

const TRIP_ID = 42;
const SIGNATURE = 'settle-sig';

function deps() {
  const wallet = Keypair.generate().publicKey;
  const vaultPda = Keypair.generate().publicKey;

  const prisma = {
    tripMember: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { userId: 7, user: { displayName: 'Ana', avatarUrl: null } },
        ]),
    },
    vaultTransaction: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    walletAccount: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ userId: 7, publicKey: wallet.toBase58() }]),
      findUnique: jest
        .fn()
        .mockResolvedValue({ userId: 7, publicKey: wallet.toBase58() }),
    },
    vaultCashSettlement: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const instruction = {
    keys: [],
    programId: Keypair.generate().publicKey,
    data: Buffer.alloc(0),
  };
  const solana = {
    feePayer: { publicKey: Keypair.generate().publicKey },
    usdcMint: Keypair.generate().publicKey,
    connection: {
      getAccountInfo: jest.fn().mockResolvedValue({ data: Buffer.alloc(165) }),
    },
    sendAsFeePayer: jest.fn().mockResolvedValue(SIGNATURE),
    closeVault: jest.fn().mockResolvedValue('close-sig'),
    program: {
      methods: {
        executeSettlement: jest.fn().mockReturnValue({
          accountsPartial: jest.fn().mockReturnValue({
            remainingAccounts: jest.fn().mockReturnValue({
              instruction: jest.fn().mockResolvedValue(instruction),
            }),
          }),
        }),
      },
      account: {
        tripVault: {
          fetch: jest.fn(),
        },
      },
    },
  };

  const vaultService = {
    requireVault: jest.fn().mockResolvedValue({
      id: 1,
      tripId: TRIP_ID,
      vaultPda: vaultPda.toBase58(),
      status: 'ACTIVE',
    }),
    getBalance: jest.fn().mockResolvedValue({ balanceMicro: 3_867_927n }),
    markClosed: jest.fn().mockResolvedValue(undefined),
    approverUserIds: jest.fn().mockResolvedValue(null),
  };

  const trips = {
    sendVaultBalanceChanged: jest.fn(),
    sendVaultSettlementUpdated: jest.fn(),
  };

  return { prisma, solana, vaultService, trips, wallet, vaultPda };
}

function build(d: ReturnType<typeof deps>) {
  return new TripVaultSettlementService(
    d.prisma as never,
    d.solana as never,
    d.vaultService as never,
    d.trips as never,
  );
}

describe('TripVaultSettlementService', () => {
  it('reports what was paid on chain, not a fresh division of an empty vault', async () => {
    const d = deps();
    d.vaultService.requireVault.mockResolvedValue({
      id: 1,
      tripId: TRIP_ID,
      vaultPda: Keypair.generate().publicKey.toBase58(),
      status: 'CLOSED',
    });
    d.prisma.vaultTransaction.findMany.mockImplementation(
      ({ where }: { where: { kind?: string } }) =>
        Promise.resolve(
          where.kind === VaultTxKind.SETTLEMENT
            ? [{ userId: 7, amountMicro: 2_000_000n }]
            : [
                {
                  kind: VaultTxKind.DEPOSIT,
                  userId: 7,
                  amountMicro: 5_000_000n,
                  shareWithUserIds: [],
                },
                {
                  kind: VaultTxKind.SPEND,
                  userId: 7,
                  amountMicro: 2_000_000n,
                  shareWithUserIds: [7],
                },
              ],
        ),
    );

    const preview = await build(d).preview(TRIP_ID, 7);
    const mine = preview.payouts.find((p) => p.userId === 7)!;

    expect(preview.isSettled).toBe(true);
    expect(mine.netMicro).toBe('3000000');
    expect(mine.onChainMicro).toBe('2000000');
    expect(mine.offChainMicro).toBe('1000000');
  });

  it('executeFromServer records payouts and closes the vault', async () => {
    const d = deps();
    d.prisma.vaultTransaction.findMany.mockResolvedValue([
      {
        kind: VaultTxKind.DEPOSIT,
        userId: 7,
        amountMicro: 5_000_000n,
        shareWithUserIds: [],
      },
    ]);
    d.vaultService.getBalance.mockResolvedValue({ balanceMicro: 5_000_000n });

    const result = await build(d).executeFromServer(TRIP_ID);

    expect(result.settled).toBe(true);
    expect(result.signature).toBe(SIGNATURE);
    expect(d.prisma.vaultTransaction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tripVaultId: 1,
          userId: 7,
          kind: VaultTxKind.SETTLEMENT,
          status: VaultTxStatus.CONFIRMED,
          signature: SIGNATURE,
        }),
      ],
    });
    expect(d.vaultService.markClosed).toHaveBeenCalledWith(TRIP_ID);
    expect(d.solana.closeVault).toHaveBeenCalled();
    expect(d.trips.sendVaultBalanceChanged).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ kind: VaultTxKind.SETTLEMENT }),
    );
    expect(d.trips.sendVaultSettlementUpdated).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ isSettled: true }),
    );
  });

  it('executeFromServer closes an empty vault and notifies balance + settlement', async () => {
    const d = deps();
    d.prisma.vaultTransaction.findMany.mockResolvedValue([
      {
        kind: VaultTxKind.DEPOSIT,
        userId: 7,
        amountMicro: 1_000_000n,
        shareWithUserIds: [],
      },
      {
        kind: VaultTxKind.SPEND,
        userId: 7,
        amountMicro: 1_000_000n,
        shareWithUserIds: [7],
      },
    ]);
    d.vaultService.getBalance.mockResolvedValue({ balanceMicro: 0n });

    const result = await build(d).executeFromServer(TRIP_ID);

    expect(result).toEqual({ settled: true, signature: null });
    expect(d.solana.sendAsFeePayer).not.toHaveBeenCalled();
    expect(d.vaultService.markClosed).toHaveBeenCalledWith(TRIP_ID);
    expect(d.trips.sendVaultBalanceChanged).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({
        kind: VaultTxKind.SETTLEMENT,
        amountMicro: '0',
      }),
    );
    expect(d.trips.sendVaultSettlementUpdated).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ isSettled: true }),
    );
  });

  it('executeFromServer is a no-op when already closed', async () => {
    const d = deps();
    d.vaultService.requireVault.mockResolvedValue({
      id: 1,
      tripId: TRIP_ID,
      vaultPda: d.vaultPda.toBase58(),
      status: 'CLOSED',
    });

    const result = await build(d).executeFromServer(TRIP_ID);

    expect(result).toEqual({ settled: true, signature: null });
    expect(d.solana.sendAsFeePayer).not.toHaveBeenCalled();
  });

  describe('a spend paid from a member wallet', () => {
    function withAnaAndBo(d: ReturnType<typeof deps>) {
      d.prisma.tripMember.findMany.mockResolvedValue([
        { userId: 7, user: { displayName: 'Ana', avatarUrl: null } },
        { userId: 8, user: { displayName: 'Bo', avatarUrl: null } },
      ]);
      d.vaultService.getBalance.mockResolvedValue({ balanceMicro: 0n });
      d.prisma.vaultTransaction.findMany.mockResolvedValue([
        {
          kind: VaultTxKind.SPEND,
          source: VaultTxSource.PERSONAL,
          userId: 7,
          amountMicro: 4_000_000n,
          shareWithUserIds: [],
          expenseName: 'Dinner',
        },
      ]);
    }

    it('is owed to the payer by the members it was shared with', async () => {
      const d = deps();
      withAnaAndBo(d);

      const preview = await build(d).preview(TRIP_ID, 7);

      const ana = preview.payouts.find((p) => p.userId === 7)!;
      const bo = preview.payouts.find((p) => p.userId === 8)!;
      expect(ana.netMicro).toBe('2000000');
      expect(bo.netMicro).toBe('-2000000');
      expect(preview.cashDebts).toEqual([
        expect.objectContaining({
          fromUserId: 8,
          toUserId: 7,
          amountMicro: '2000000',
        }),
      ]);
    });

    // Leave pays out vault money only. Fronting a dinner must not block a
    // member from leaving, nor be paid back out of other people's deposits.
    it('does not count toward the net the leave flow pays out', async () => {
      const d = deps();
      withAnaAndBo(d);
      d.prisma.tripVault = {
        findUnique: jest.fn().mockResolvedValue({ id: 1 }),
      } as never;

      const service = build(d);
      expect(await service.memberNetMicro(TRIP_ID, 7)).toBe(0n);
      expect(await service.memberNetMicro(TRIP_ID, 8)).toBe(0n);
    });
  });
});
