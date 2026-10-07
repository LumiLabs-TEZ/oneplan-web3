import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ExpenseCategory, VaultTxSource, VaultTxStatus } from '@prisma/client';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Keypair, TransactionInstruction } from '@solana/web3.js';

import { Prisma } from '@prisma/client';
import {
  approveSpendIx,
  cancelSpendIx,
  depositIx,
  proposeSpendIx,
  signTx,
  spendIx,
  testSolana,
  transferIx,
} from '../solana/testing/vault-tx';
import { TripVaultPayService } from './trip-vault-pay.service';

/** Static VietQR: PVcomBank 970412, account 109000636588, no amount. */
function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, '0') + value;
}
const STATIC_QR = (() => {
  const merchant =
    tlv('00', 'A000000727') +
    tlv('01', tlv('00', '970412') + tlv('01', '109000636588')) +
    tlv('02', 'QRIBFTTA');
  return (
    tlv('00', '01') +
    tlv('01', '11') +
    tlv('38', merchant) +
    tlv('53', '704') +
    tlv('58', 'VN') +
    tlv('63', 'ABCD')
  );
})();

/** Real fee payer / program / mint so signed transactions decode for real. */
const real = testSolana();
/** User 7's wallet, the payer in most tests. */
const member = Keypair.generate();
const VAULT_PDA = Keypair.generate().publicKey;
const VAULT_ATA = getAssociatedTokenAddressSync(real.usdcMint, VAULT_PDA, true);
const RECEIVER = Keypair.generate().publicKey;
const RECEIVER_ATA = getAssociatedTokenAddressSync(real.usdcMint, RECEIVER);
const VAULT_ROW = {
  id: 1,
  tripId: 42,
  vaultPda: VAULT_PDA.toBase58(),
  usdcAta: VAULT_ATA.toBase58(),
  thresholdMicro: 10_000_000n,
};

function deps() {
  // Prisma's update returns the whole row, not just the changed columns, and the
  // service reads status off the result. A mock that returns only `data` would
  // make the UNKNOWN branch look like it cleared the status.
  let current: Record<string, unknown> = {};
  const prisma = {
    vaultTransaction: {
      create: jest.fn().mockResolvedValue({ id: 9 }),
      update: jest
        .fn()
        .mockImplementation((args: { data: Record<string, unknown> }) => {
          current = { ...current, ...args.data };
          return Promise.resolve(current);
        }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(current)),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(() => Promise.resolve(current)),
    },
    tripVault: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ tripId: 42 }),
    },
    walletAccount: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ publicKey: member.publicKey.toBase58() }),
    },
    tripMember: {
      // By default every requested id is an accepted member.
      findMany: jest
        .fn()
        .mockImplementation((args: { where: { userId?: { in: number[] } } }) =>
          Promise.resolve(
            (args.where.userId?.in ?? []).map((userId) => ({ userId })),
          ),
        ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Ana' }) },
  };
  const vaultService = {
    requireVault: jest.fn().mockResolvedValue(VAULT_ROW),
    getBalance: jest.fn().mockResolvedValue({ balanceMicro: 100_000_000n }),
    ensureDefaultVault: jest.fn().mockResolvedValue({
      id: 1,
      tripId: 42,
      vaultPda: Keypair.generate().publicKey.toBase58(),
      usdcAta: Keypair.generate().publicKey.toBase58(),
      thresholdMicro: 10_000_000n,
    }),
    walletBalance: jest.fn().mockResolvedValue({
      publicKey: null,
      usdcAta: null,
      balanceMicro: 0n,
    }),
    invalidateBalance: jest.fn(),
    approverUserIds: jest.fn().mockResolvedValue(null),
  };
  const solana = {
    broadcastSigned: jest.fn().mockResolvedValue('sig-123'),
    confirmSigned: jest.fn().mockResolvedValue(undefined),
    signatureLanded: jest.fn().mockResolvedValue(true),
    usdcMint: real.usdcMint,
    feePayer: real.feePayer,
    receiverPublicKey: RECEIVER,
    ensureReceiverAta: jest.fn(),
    buildUnsignedTx: jest.fn().mockResolvedValue('base64tx'),
    program: {
      programId: real.program.programId,
      methods: {
        spend: () => ({ accountsPartial: () => ({ instruction: jest.fn() }) }),
        proposeSpend: () => ({
          accountsPartial: () => ({ instruction: jest.fn() }),
        }),
        approveSpend: () => ({
          accountsPartial: () => ({ instruction: jest.fn() }),
        }),
        cancelSpend: () => ({
          accountsPartial: () => ({ instruction: jest.fn() }),
        }),
      },
      account: {
        tripVault: {
          fetch: jest.fn().mockResolvedValue({
            hasActiveSpend: true,
            totalSpent: { toString: () => '0' },
          }),
        },
      },
    },
  };
  const payout = {
    validateRecipient: jest
      .fn()
      .mockResolvedValue({ accountName: 'NGUYEN VAN A' }),
    quote: jest.fn().mockResolvedValue({
      amountUsdcMicro: 7_660_000n,
      feeMicro: 57_450n,
      rate: '26500',
    }),
    payout: jest.fn().mockResolvedValue({ outcome: 'SUCCESS' }),
    getStatus: jest.fn(),
  };
  const expenses = { createFromVault: jest.fn().mockResolvedValue({ id: 55 }) };
  const trips = {
    sendVaultApprovalRequested: jest.fn(),
    sendVaultBalanceChanged: jest.fn(),
  };
  solana.ensureReceiverAta.mockResolvedValue(
    getAssociatedTokenAddressSync(solana.usdcMint, solana.receiverPublicKey),
  );
  const seed = (row: Record<string, unknown>) => {
    current = { ...row };
    prisma.vaultTransaction.findUnique.mockResolvedValue(current);
  };
  return { prisma, vaultService, solana, payout, expenses, trips, seed };
}

function build(d: ReturnType<typeof deps>): TripVaultPayService {
  return new TripVaultPayService(
    d.prisma as never,
    d.vaultService as never,
    d.solana as never,
    d.payout as never,
    d.expenses as never,
    d.trips as never,
  );
}

const TRIP_ID = 42;

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    tripVaultId: 1,
    // Present because submitPayment/buildApprovalTx load the row with the vault
    // joined in, to prove the transaction belongs to the trip in the URL.
    tripVault: { tripId: TRIP_ID },
    userId: 7,
    amountMicro: 7_660_000n,
    amountVnd: 200_000n,
    bankBin: '970412',
    bankAccount: '109000636588',
    status: VaultTxStatus.PENDING,
    payoutRef: 'vault-tx-9',
    expenseName: 'Coffee',
    expenseCategory: ExpenseCategory.COFFEE,
    shareWithUserIds: [7, 8],
    ...overrides,
  };
}

async function spendTx(amount = 7_660_000n, signer = member) {
  return signTx(
    real,
    [
      await spendIx(real, {
        vault: VAULT_PDA,
        signer: signer.publicKey,
        amount,
        recipientAta: RECEIVER_ATA,
      }),
    ],
    [signer],
  );
}

async function proposeTx(amount = 20_000_000n, signer = member) {
  return signTx(
    real,
    [
      await proposeSpendIx(real, {
        vault: VAULT_PDA,
        signer: signer.publicKey,
        amount,
        recipientAta: RECEIVER_ATA,
      }),
    ],
    [signer],
  );
}

async function approveTx(signer: Keypair, vault = VAULT_PDA) {
  return signTx(
    real,
    [
      await approveSpendIx(real, {
        vault,
        signer: signer.publicKey,
        recipientAta: RECEIVER_ATA,
      }),
    ],
    [signer],
  );
}

function personalTx(amount = 7_660_000n, to = RECEIVER_ATA, signer = member) {
  return signTx(
    real,
    [transferIx(real, { owner: signer.publicKey, to, amount })],
    [signer],
  );
}

describe('TripVaultPayService', () => {
  it('derives a deterministic payout reference', () => {
    expect(build(deps()).payoutRefFor(7)).toBe('vault-tx-7');
  });

  it('rejects a payment above the vault balance', async () => {
    const d = deps();
    d.vaultService.getBalance.mockResolvedValue({ balanceMicro: 1_000n });

    await expect(build(d).quote(42, 7, STATIC_QR, 200_000n)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a static QR with no amount supplied', async () => {
    await expect(build(deps()).quote(42, 7, STATIC_QR)).rejects.toThrow(
      /amount/i,
    );
  });

  it('rejects a recipient the provider cannot validate', async () => {
    const d = deps();
    d.payout.validateRecipient.mockResolvedValue(null);

    await expect(build(d).quote(42, 7, STATIC_QR, 200_000n)).rejects.toThrow(
      /recipient/i,
    );
  });

  it('flags amounts above the threshold as needing approval', async () => {
    const d = deps();
    d.payout.quote.mockResolvedValue({
      amountUsdcMicro: 50_000_000n,
      feeMicro: 0n,
      rate: '26500',
    });

    const quote = await build(d).quote(42, 7, STATIC_QR, 1_325_000_000n);
    expect(quote.needsApproval).toBe(true);
  });

  it('does not flag amounts at the threshold', async () => {
    const d = deps();
    d.payout.quote.mockResolvedValue({
      amountUsdcMicro: 10_000_000n,
      feeMicro: 0n,
      rate: '26500',
    });

    const quote = await build(d).quote(42, 7, STATIC_QR, 265_000_000n);
    expect(quote.needsApproval).toBe(false);
  });

  it('creates the expense with its split when the payout succeeds', async () => {
    const d = deps();
    d.seed(pendingRow());

    const result = await build(d).submitPayment(9, await spendTx(), TRIP_ID, 7);

    expect(result.status).toBe(VaultTxStatus.CONFIRMED);
    expect(d.expenses.createFromVault).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 42,
        name: 'Coffee',
        category: ExpenseCategory.COFFEE,
        shareWithUserIds: [7, 8],
      }),
    );
  });

  // The proposal's address is not knowable before the transaction that creates
  // it runs. Deriving it beforehand left rows pointing at accounts that never
  // existed, and gave two members preparing at once the same address.
  it('records the proposal address the chain actually used', async () => {
    const d = deps();
    d.seed(pendingRow({ amountMicro: 20_000_000n, proposalPda: null }));

    await build(d).submitPayment(9, await proposeTx(), TRIP_ID, 7);

    expect(d.prisma.vaultTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ proposalPda: expect.any(String) }),
      }),
    );
  });

  // Asking for an approval before the proposal exists invites the other member
  // to sign something that can only fail.
  it('asks for approval only once the proposal is on chain', async () => {
    const d = deps();
    d.seed(pendingRow({ amountMicro: 20_000_000n, proposalPda: null }));

    d.payout.quote.mockResolvedValue({
      amountUsdcMicro: 20_000_000n,
      feeMicro: 0n,
      rate: '26500',
    });

    await build(d).preparePayment(TRIP_ID, 7, {
      qrPayload: STATIC_QR,
      amountVnd: 530_000_000n,
      name: 'Dinner',
      category: ExpenseCategory.FOOD,
      shareWithUserIds: [7],
      source: VaultTxSource.VAULT,
    });
    expect(d.trips.sendVaultApprovalRequested).not.toHaveBeenCalled();

    await build(d).submitPayment(9, await proposeTx(), TRIP_ID, 7);
    expect(d.trips.sendVaultApprovalRequested).toHaveBeenCalled();
  });

  // The vault must not pay a merchant for money still sitting in it.
  it('does not pay the merchant on the proposal leg', async () => {
    const d = deps();
    d.seed(pendingRow({ amountMicro: 20_000_000n, proposalPda: null }));

    await build(d).submitPayment(9, await proposeTx(), TRIP_ID, 7);

    expect(d.payout.payout).not.toHaveBeenCalled();
  });

  it('marks the row failed when the payout is confirmed FAILED', async () => {
    const d = deps();
    d.seed(pendingRow());
    d.payout.payout.mockResolvedValue({
      outcome: 'FAILED',
      failureCode: 'MOCK_DECLINED',
    });

    const result = await build(d).submitPayment(9, await spendTx(), TRIP_ID, 7);

    expect(result.status).toBe(VaultTxStatus.FAILED);
    expect(d.expenses.createFromVault).not.toHaveBeenCalled();
  });

  it('leaves the transaction PENDING when the payout is UNKNOWN', async () => {
    const d = deps();
    d.seed(pendingRow());
    d.payout.payout.mockResolvedValue({ outcome: 'UNKNOWN' });

    const result = await build(d).submitPayment(9, await spendTx(), TRIP_ID, 7);

    // The critical assertion: an ambiguous payout must not create an expense and
    // must not mark the row failed, because a revert would then pay twice.
    expect(result.status).toBe(VaultTxStatus.PENDING);
    expect(d.expenses.createFromVault).not.toHaveBeenCalled();
  });

  it('is idempotent: a row that is no longer PENDING is returned untouched', async () => {
    const d = deps();
    d.seed(pendingRow({ status: VaultTxStatus.CONFIRMED }));

    const result = await build(d).submitPayment(9, 'ignored', TRIP_ID, 7);

    expect(result.status).toBe(VaultTxStatus.CONFIRMED);
    expect(d.solana.broadcastSigned).not.toHaveBeenCalled();
    expect(d.payout.payout).not.toHaveBeenCalled();
  });

  it('refuses a transaction that belongs to a different trip', async () => {
    const d = deps();
    d.seed(pendingRow());

    // The route nests the transaction under a trip. Without this check the trip
    // segment is decorative and any member of any trip could spend another
    // trip's vault just by guessing a transaction id.
    await expect(
      build(d).submitPayment(9, 'ignored', TRIP_ID + 1, 7),
    ).rejects.toThrow(NotFoundException);

    expect(d.solana.broadcastSigned).not.toHaveBeenCalled();
    expect(d.payout.payout).not.toHaveBeenCalled();
  });

  describe('abandoning a payment the client could not sign', () => {
    it('marks an unsigned PENDING row abandoned', async () => {
      const d = deps();
      d.seed(pendingRow({ signature: null, proposalPda: null }));

      const result = await build(d).abandonPayment(9, TRIP_ID, 7);

      expect(result.status).toBe(VaultTxStatus.FAILED);
      expect(d.prisma.vaultTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: VaultTxStatus.FAILED, failureCode: 'abandoned' },
        }),
      );
    });

    it('refuses once a signature exists', async () => {
      const d = deps();
      d.seed(pendingRow({ signature: 'sig-123', proposalPda: null }));

      await expect(build(d).abandonPayment(9, TRIP_ID, 7)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses another member', async () => {
      const d = deps();
      d.seed(pendingRow({ signature: null, proposalPda: null }));

      await expect(build(d).abandonPayment(9, TRIP_ID, 8)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('is idempotent once the row is no longer PENDING', async () => {
      const d = deps();
      d.seed(pendingRow({ status: VaultTxStatus.CONFIRMED }));

      const result = await build(d).abandonPayment(9, TRIP_ID, 7);

      expect(result.status).toBe(VaultTxStatus.CONFIRMED);
      expect(d.prisma.vaultTransaction.update).not.toHaveBeenCalled();
    });

    it('refuses a transaction from another trip', async () => {
      const d = deps();
      d.seed(pendingRow({ signature: null }));

      await expect(build(d).abandonPayment(9, 999, 7)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('paid from the member wallet (PERSONAL)', () => {
    const owner = Keypair.generate();

    /** A member with USDC of their own. */
    function withWallet(
      d: ReturnType<typeof deps>,
      balanceMicro = 50_000_000n,
    ) {
      const usdcAta = getAssociatedTokenAddressSync(
        d.solana.usdcMint,
        owner.publicKey,
      );
      d.vaultService.walletBalance.mockResolvedValue({
        publicKey: owner.publicKey.toBase58(),
        usdcAta: usdcAta.toBase58(),
        balanceMicro,
      });
      d.prisma.walletAccount.findUnique.mockResolvedValue({
        publicKey: owner.publicKey.toBase58(),
      });
      return usdcAta;
    }

    const personalInput = {
      qrPayload: STATIC_QR,
      amountVnd: 200_000n,
      name: 'Dinner',
      category: ExpenseCategory.FOOD,
      shareWithUserIds: [],
      source: VaultTxSource.PERSONAL,
    };

    it('checks the member wallet, not the vault, and charges no fee', async () => {
      const d = deps();
      // Vault is empty; the member is not.
      d.vaultService.getBalance.mockResolvedValue({ balanceMicro: 0n });
      withWallet(d, 7_660_000n);

      const quote = await build(d).quote(
        42,
        7,
        STATIC_QR,
        200_000n,
        VaultTxSource.PERSONAL,
      );

      expect(quote.source).toBe(VaultTxSource.PERSONAL);
      expect(d.vaultService.getBalance).not.toHaveBeenCalled();
    });

    it('creates the vault on demand instead of requiring one', async () => {
      const d = deps();
      withWallet(d);
      d.vaultService.requireVault.mockRejectedValue(
        new NotFoundException('Trip 42 has no vault'),
      );

      const quote = await build(d).quote(
        42,
        7,
        STATIC_QR,
        200_000n,
        VaultTxSource.PERSONAL,
      );

      expect(quote.source).toBe(VaultTxSource.PERSONAL);
      expect(d.vaultService.ensureDefaultVault).toHaveBeenCalledWith(42, 7);
    });

    it('rejects a payment above the member wallet balance', async () => {
      const d = deps();
      withWallet(d, 1_000n);

      await expect(
        build(d).quote(42, 7, STATIC_QR, 200_000n, VaultTxSource.PERSONAL),
      ).rejects.toThrow(/wallet balance/i);
    });

    it('rejects a member with no wallet linked', async () => {
      const d = deps();

      await expect(
        build(d).quote(42, 7, STATIC_QR, 200_000n, VaultTxSource.PERSONAL),
      ).rejects.toThrow(/link a wallet/i);
    });

    it('never needs approval, however large', async () => {
      const d = deps();
      withWallet(d, 100_000_000n);
      d.payout.quote.mockResolvedValue({
        amountUsdcMicro: 50_000_000n,
        feeMicro: 0n,
        rate: '26500',
      });

      const quote = await build(d).quote(
        42,
        7,
        STATIC_QR,
        1_325_000_000n,
        VaultTxSource.PERSONAL,
      );
      expect(quote.needsApproval).toBe(false);
    });

    it('builds a token transfer from the member ATA to the receiver, not a vault spend', async () => {
      const d = deps();
      const ownerAta = withWallet(d);
      const spend = jest.fn();
      d.solana.program.methods.spend = spend as never;

      const prepared = await build(d).preparePayment(TRIP_ID, 7, personalInput);

      expect(spend).not.toHaveBeenCalled();
      expect(prepared.source).toBe(VaultTxSource.PERSONAL);
      expect(prepared.needsApproval).toBe(false);
      expect(prepared.amountUsdcMicro).toBe('7660000');
      expect(prepared.payerAta).toBe(ownerAta.toBase58());

      const [ixs] = d.solana.buildUnsignedTx.mock.calls[0] as [
        TransactionInstruction[],
      ];
      expect(ixs).toHaveLength(1);
      const ix = ixs[0];
      expect(ix.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
      // transferChecked: tag 12, u64 amount, u8 decimals.
      expect(ix.data[0]).toBe(12);
      expect(ix.data.readBigUInt64LE(1)).toBe(7_660_000n);
      expect(ix.data[9]).toBe(6);
      const receiverAta = getAssociatedTokenAddressSync(
        d.solana.usdcMint,
        d.solana.receiverPublicKey,
      );
      expect(ix.keys[0].pubkey.equals(ownerAta)).toBe(true);
      expect(ix.keys[1].pubkey.equals(d.solana.usdcMint)).toBe(true);
      expect(ix.keys[2].pubkey.equals(receiverAta)).toBe(true);
      expect(ix.keys[3].pubkey.equals(owner.publicKey)).toBe(true);

      expect(d.prisma.vaultTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: VaultTxSource.PERSONAL,
            feeMicro: 0n,
          }),
        }),
      );
    });

    it('skips the proposal leg above the threshold and pays the merchant', async () => {
      const d = deps();
      d.seed(
        pendingRow({
          source: VaultTxSource.PERSONAL,
          amountMicro: 20_000_000n,
          proposalPda: null,
        }),
      );

      const result = await build(d).submitPayment(
        9,
        personalTx(20_000_000n),
        TRIP_ID,
        7,
      );

      expect(result.status).toBe(VaultTxStatus.CONFIRMED);
      expect(d.trips.sendVaultApprovalRequested).not.toHaveBeenCalled();
      expect(d.payout.payout).toHaveBeenCalledTimes(1);
      expect(d.expenses.createFromVault).toHaveBeenCalledWith(
        expect.objectContaining({ paidByUserId: 7 }),
      );
      // The vault never moved, so its cached balance is still right.
      expect(d.vaultService.invalidateBalance).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // S2: the signed transaction must be the one the row asked for.
  // ---------------------------------------------------------------------
  describe('S2: submitPayment binds the signed transaction to the row', () => {
    /** Nothing may reach the chain, the payout provider or the ledger. */
    function expectUntouched(d: ReturnType<typeof deps>) {
      expect(d.solana.broadcastSigned).not.toHaveBeenCalled();
      expect(d.payout.payout).not.toHaveBeenCalled();
      expect(d.expenses.createFromVault).not.toHaveBeenCalled();
    }

    it('rejects a 1-micro transfer submitted under a payment for 7.66 USDC', async () => {
      const d = deps();
      d.seed(pendingRow());
      // The attack: the member's own tiny withdraw, fee-payer signed, sent as
      // the "signed spend" so the server pays the merchant for USDC that
      // never left the vault.
      const withdraw = personalTx(1n, Keypair.generate().publicKey);

      await expect(
        build(d).submitPayment(9, withdraw, TRIP_ID, 7),
      ).rejects.toThrow(BadRequestException);
      expectUntouched(d);
    });

    it('rejects a spend for a different amount', async () => {
      const d = deps();
      d.seed(pendingRow());

      await expect(
        build(d).submitPayment(9, await spendTx(1n), TRIP_ID, 7),
      ).rejects.toThrow(/amount does not match/);
      expectUntouched(d);
    });

    it('rejects a spend against another trip’s vault', async () => {
      const d = deps();
      d.seed(pendingRow());
      const otherVault = Keypair.generate().publicKey;
      const tx = signTx(
        real,
        [
          await spendIx(real, {
            vault: otherVault,
            signer: member.publicKey,
            amount: 7_660_000n,
            recipientAta: RECEIVER_ATA,
          }),
        ],
        [member],
      );

      await expect(build(d).submitPayment(9, tx, TRIP_ID, 7)).rejects.toThrow(
        /not the expected account/,
      );
      expectUntouched(d);
    });

    it('rejects a spend that pays someone other than the receiver', async () => {
      const d = deps();
      d.seed(pendingRow());
      const tx = signTx(
        real,
        [
          await spendIx(real, {
            vault: VAULT_PDA,
            signer: member.publicKey,
            amount: 7_660_000n,
            recipientAta: getAssociatedTokenAddressSync(
              real.usdcMint,
              Keypair.generate().publicKey,
            ),
          }),
        ],
        [member],
      );

      await expect(build(d).submitPayment(9, tx, TRIP_ID, 7)).rejects.toThrow(
        /recipient_ata/,
      );
      expectUntouched(d);
    });

    it('rejects another member submitting the payer’s payment', async () => {
      const d = deps();
      d.seed(pendingRow());
      const intruder = Keypair.generate();
      d.prisma.walletAccount.findUnique.mockResolvedValue({
        publicKey: intruder.publicKey.toBase58(),
      });

      await expect(
        build(d).submitPayment(
          9,
          await spendTx(7_660_000n, intruder),
          TRIP_ID,
          8,
        ),
      ).rejects.toThrow(ForbiddenException);
      expectUntouched(d);
    });

    it('rejects a transaction signed by a wallet that is not the caller’s', async () => {
      const d = deps();
      d.seed(pendingRow());
      const other = Keypair.generate();

      await expect(
        build(d).submitPayment(9, await spendTx(7_660_000n, other), TRIP_ID, 7),
      ).rejects.toThrow(/signer is not the expected account/);
      expectUntouched(d);
    });

    it('rejects a spend presented for a PERSONAL payment (and the reverse)', async () => {
      const d = deps();
      d.seed(pendingRow({ source: VaultTxSource.PERSONAL }));
      await expect(
        build(d).submitPayment(9, await spendTx(), TRIP_ID, 7),
      ).rejects.toThrow(BadRequestException);

      const d2 = deps();
      d2.seed(pendingRow());
      await expect(
        build(d2).submitPayment(9, personalTx(), TRIP_ID, 7),
      ).rejects.toThrow(BadRequestException);
      expectUntouched(d);
      expectUntouched(d2);
    });

    it('rejects a PERSONAL transfer to a wrong destination or amount', async () => {
      const d = deps();
      d.seed(pendingRow({ source: VaultTxSource.PERSONAL }));
      await expect(
        build(d).submitPayment(
          9,
          personalTx(7_660_000n, Keypair.generate().publicKey),
          TRIP_ID,
          7,
        ),
      ).rejects.toThrow(/does not match/);
      await expect(
        build(d).submitPayment(9, personalTx(1n), TRIP_ID, 7),
      ).rejects.toThrow(/does not match/);
      expectUntouched(d);
    });

    it('accepts the exact spend the row asked for', async () => {
      const d = deps();
      d.seed(pendingRow());
      await expect(
        build(d).submitPayment(9, await spendTx(), TRIP_ID, 7),
      ).resolves.toMatchObject({ status: VaultTxStatus.CONFIRMED });
    });

    describe('approval leg', () => {
      const approver = Keypair.generate();

      function approvalRow(d: ReturnType<typeof deps>) {
        d.seed(
          pendingRow({
            amountMicro: 20_000_000n,
            proposalPda: `${VAULT_PDA.toBase58()}:0`,
          }),
        );
        d.prisma.walletAccount.findUnique.mockResolvedValue({
          publicKey: approver.publicKey.toBase58(),
        });
      }

      it('refuses the proposer approving their own payment', async () => {
        const d = deps();
        approvalRow(d);
        d.prisma.walletAccount.findUnique.mockResolvedValue({
          publicKey: member.publicKey.toBase58(),
        });

        await expect(
          build(d).submitPayment(9, await approveTx(member), TRIP_ID, 7),
        ).rejects.toThrow(ForbiddenException);
        expectUntouched(d);
      });

      it('refuses a plain member when the trip restricts approvals', async () => {
        const d = deps();
        approvalRow(d);
        d.vaultService.approverUserIds.mockResolvedValue([3, 4]);

        await expect(
          build(d).submitPayment(9, await approveTx(approver), TRIP_ID, 8),
        ).rejects.toThrow(/host or co-host/);
        expectUntouched(d);
      });

      it('refuses an approval for another vault', async () => {
        const d = deps();
        approvalRow(d);

        await expect(
          build(d).submitPayment(
            9,
            await approveTx(approver, Keypair.generate().publicKey),
            TRIP_ID,
            8,
          ),
        ).rejects.toThrow(/not the expected account/);
        expectUntouched(d);
      });

      it('refuses a re-sent proposal on the approval leg', async () => {
        const d = deps();
        approvalRow(d);
        d.prisma.walletAccount.findUnique.mockResolvedValue({
          publicKey: member.publicKey.toBase58(),
        });

        await expect(
          build(d).submitPayment(9, await proposeTx(), TRIP_ID, 8),
        ).rejects.toThrow(/not approve_spend/);
        expectUntouched(d);
      });

      it('lets an eligible approver through to broadcast', async () => {
        const d = deps();
        approvalRow(d);
        d.vaultService.approverUserIds.mockResolvedValue([8]);
        // not yet executed on chain -> stays PENDING, but it was accepted
        d.solana.program.account.tripVault.fetch.mockResolvedValue({
          hasActiveSpend: true,
          totalSpent: { toString: () => '0' },
        });

        await build(d).submitPayment(9, await approveTx(approver), TRIP_ID, 8);

        expect(d.solana.broadcastSigned).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ---------------------------------------------------------------------
  // I2: the blockhash expired while the member was approving in the wallet
  // ---------------------------------------------------------------------
  describe('I2: an expired blockhash on submit', () => {
    const expired = () =>
      new ConflictException({ code: 'tx_expired', message: 'expired' });

    it('retires the unsigned row as abandoned and surfaces the 409', async () => {
      const d = deps();
      d.seed(pendingRow({ signature: null, proposalPda: null }));
      const error = expired();
      d.solana.broadcastSigned.mockRejectedValue(error);

      await expect(
        build(d).submitPayment(9, await spendTx(), TRIP_ID, 7),
      ).rejects.toBe(error);

      // Nothing reached the chain, so this is the same retirement the client's
      // abandon call makes — the client skips it once a signature exists.
      expect(d.prisma.vaultTransaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 9,
          status: VaultTxStatus.PENDING,
          signature: null,
          proposalPda: null,
        },
        data: { status: VaultTxStatus.FAILED, failureCode: 'abandoned' },
      });
      expect(d.payout.payout).not.toHaveBeenCalled();
    });

    it('keeps an open proposal PENDING when the approval expired', async () => {
      const d = deps();
      d.seed(
        pendingRow({
          amountMicro: 20_000_000n,
          proposalPda: `${VAULT_PDA.toBase58()}:0`,
          signature: 'proposal-sig',
        }),
      );
      const approver = Keypair.generate();
      d.prisma.walletAccount.findUnique.mockResolvedValue({
        publicKey: approver.publicKey.toBase58(),
      });
      d.vaultService.approverUserIds.mockResolvedValue([8]);
      d.solana.broadcastSigned.mockRejectedValue(expired());

      await expect(
        build(d).submitPayment(9, await approveTx(approver), TRIP_ID, 8),
      ).rejects.toThrow(ConflictException);
      // The proposal is still on chain and can be approved again.
      expect(d.prisma.vaultTransaction.updateMany).not.toHaveBeenCalled();
    });

    it('leaves the row alone on any other broadcast failure', async () => {
      const d = deps();
      d.seed(pendingRow({ signature: null, proposalPda: null }));
      d.solana.broadcastSigned.mockRejectedValue(new Error('rpc down'));

      await expect(
        build(d).submitPayment(9, await spendTx(), TRIP_ID, 7),
      ).rejects.toThrow('rpc down');
      expect(d.prisma.vaultTransaction.updateMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // S7: idempotency
  // ---------------------------------------------------------------------
  describe('S7: one signed transaction, one payment', () => {
    it('a replayed transaction cannot attach its signature to a second row', async () => {
      const d = deps();
      d.seed(pendingRow());
      d.prisma.vaultTransaction.update.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        build(d).submitPayment(9, await spendTx(), TRIP_ID, 7),
      ).rejects.toThrow(/already submitted/);
      expect(d.payout.payout).not.toHaveBeenCalled();
    });

    it('parallel submits: only the one that wins the claim pays and books the expense', async () => {
      const d = deps();
      d.seed(pendingRow());
      d.prisma.vaultTransaction.updateMany.mockResolvedValue({ count: 0 });

      await build(d).submitPayment(9, await spendTx(), TRIP_ID, 7);

      expect(d.payout.payout).not.toHaveBeenCalled();
      expect(d.expenses.createFromVault).not.toHaveBeenCalled();
    });

    it('the winner claims the fiat leg atomically before paying', async () => {
      const d = deps();
      d.seed(pendingRow());

      await build(d).submitPayment(9, await spendTx(), TRIP_ID, 7);

      expect(d.prisma.vaultTransaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 9,
          status: VaultTxStatus.PENDING,
          payoutStatus: null,
        },
        data: { payoutStatus: 'SENDING' },
      });
      expect(d.payout.payout).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------
  // S3: cancel
  // ---------------------------------------------------------------------
  describe('S3: submitCancel', () => {
    async function cancelTx(vault = VAULT_PDA, signer = member) {
      return signTx(
        real,
        [await cancelSpendIx(real, { vault, signer: signer.publicKey })],
        [signer],
      );
    }
    const proposalRow = (over: Record<string, unknown> = {}) =>
      pendingRow({
        amountMicro: 20_000_000n,
        proposalPda: `${VAULT_PDA.toBase58()}:0`,
        ...over,
      });

    it('cancels an open proposal for its proposer', async () => {
      const d = deps();
      d.seed(proposalRow());

      await build(d).submitCancel(9, await cancelTx(), TRIP_ID, 7);

      expect(d.solana.broadcastSigned).toHaveBeenCalledTimes(1);
      expect(d.prisma.vaultTransaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 9,
            status: VaultTxStatus.PENDING,
          }),
          data: expect.objectContaining({
            status: VaultTxStatus.FAILED,
            failureCode: 'cancelled',
            proposalPda: null,
          }),
        }),
      );
    });

    it('a host may cancel someone else’s proposal', async () => {
      const d = deps();
      d.seed(proposalRow());
      const host = Keypair.generate();
      d.prisma.walletAccount.findUnique.mockResolvedValue({
        publicKey: host.publicKey.toBase58(),
      });
      d.prisma.tripMember.findFirst.mockResolvedValue({ id: 1 });

      await build(d).submitCancel(
        9,
        await cancelTx(VAULT_PDA, host),
        TRIP_ID,
        3,
      );

      expect(d.solana.broadcastSigned).toHaveBeenCalledTimes(1);
    });

    it('refuses to cancel a CONFIRMED spend (the fiat is already paid)', async () => {
      const d = deps();
      d.seed(proposalRow({ status: VaultTxStatus.CONFIRMED }));

      await expect(
        build(d).submitCancel(9, await cancelTx(), TRIP_ID, 7),
      ).rejects.toThrow(/no open proposal/);
      expect(d.solana.broadcastSigned).not.toHaveBeenCalled();
      expect(d.prisma.vaultTransaction.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a row with no open proposal', async () => {
      const d = deps();
      d.seed(pendingRow({ proposalPda: null }));

      await expect(
        build(d).submitCancel(9, await cancelTx(), TRIP_ID, 7),
      ).rejects.toThrow(BadRequestException);
      expect(d.solana.broadcastSigned).not.toHaveBeenCalled();
    });

    it('refuses a member who is neither the proposer nor a host', async () => {
      const d = deps();
      d.seed(proposalRow());
      const intruder = Keypair.generate();
      d.prisma.walletAccount.findUnique.mockResolvedValue({
        publicKey: intruder.publicKey.toBase58(),
      });

      await expect(
        build(d).submitCancel(
          9,
          await cancelTx(VAULT_PDA, intruder),
          TRIP_ID,
          8,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(d.solana.broadcastSigned).not.toHaveBeenCalled();
    });

    it('refuses arbitrary transactions (a deposit, another vault)', async () => {
      const d = deps();
      d.seed(proposalRow());
      const deposit = signTx(
        real,
        [
          await depositIx(real, {
            vault: VAULT_PDA,
            owner: member.publicKey,
            amount: 1n,
          }),
        ],
        [member],
      );

      await expect(
        build(d).submitCancel(9, deposit, TRIP_ID, 7),
      ).rejects.toThrow(/not cancel_spend/);
      await expect(
        build(d).submitCancel(
          9,
          await cancelTx(Keypair.generate().publicKey),
          TRIP_ID,
          7,
        ),
      ).rejects.toThrow(/not the expected account/);
      expect(d.solana.broadcastSigned).not.toHaveBeenCalled();
    });

    it('the unsigned cancel/approve builders enforce the same rules', async () => {
      const d = deps();
      d.seed(proposalRow({ status: VaultTxStatus.CONFIRMED }));
      await expect(build(d).buildCancelTx(9, 7, TRIP_ID)).rejects.toThrow(
        BadRequestException,
      );
      await expect(build(d).buildApprovalTx(9, 8, TRIP_ID)).rejects.toThrow(
        BadRequestException,
      );

      const d2 = deps();
      d2.seed(proposalRow());
      await expect(build(d2).buildApprovalTx(9, 7, TRIP_ID)).rejects.toThrow(
        ForbiddenException,
      ); // proposer approving own payment
      await expect(build(d2).buildCancelTx(9, 8, TRIP_ID)).rejects.toThrow(
        ForbiddenException,
      ); // neither proposer nor host
    });
  });

  // ---------------------------------------------------------------------
  // S6: shareWithUserIds
  // ---------------------------------------------------------------------
  describe('S6: shareWithUserIds', () => {
    const input = (shareWithUserIds: number[]) => ({
      qrPayload: STATIC_QR,
      amountVnd: 200_000n,
      name: 'Dinner',
      category: ExpenseCategory.FOOD,
      shareWithUserIds,
      source: VaultTxSource.VAULT,
    });

    it('rejects an id that is not an accepted member, before any row exists', async () => {
      const d = deps();
      d.prisma.tripMember.findMany.mockResolvedValue([{ userId: 7 }]);

      await expect(
        build(d).preparePayment(TRIP_ID, 7, input([7, 999])),
      ).rejects.toThrow(/accepted trip members/);
      expect(d.prisma.vaultTransaction.create).not.toHaveBeenCalled();
    });

    it('dedupes repeated ids so createFromVault cannot trip over them', async () => {
      const d = deps();

      await build(d).preparePayment(TRIP_ID, 7, input([7, 8, 7, 8, 8]));

      expect(d.prisma.vaultTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ shareWithUserIds: [7, 8] }),
        }),
      );
    });

    it('keeps an empty list (= everyone) as is', async () => {
      const d = deps();

      await build(d).preparePayment(TRIP_ID, 7, input([]));

      expect(d.prisma.tripMember.findMany).not.toHaveBeenCalled();
      expect(d.prisma.vaultTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ shareWithUserIds: [] }),
        }),
      );
    });
  });
});
