import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InviteStatus, Prisma, TripMemberRole } from '@prisma/client';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';

import {
  depositIx,
  signTx,
  testSolana,
  transferIx,
} from '../solana/testing/vault-tx';
import { transactionSignature } from '../solana/tx-verify';
import { VaultSafetyService } from '../solana/vault-safety.service';
import {
  MAX_DAILY_LIMIT_MICRO,
  MAX_THRESHOLD_MICRO,
  TripVaultService,
} from './trip-vault.service';

const PROGRAM_ID = new PublicKey(
  'HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL',
);

function makeDeps() {
  const prisma = {
    trip: { findUnique: jest.fn().mockResolvedValue({ id: 42 }) },
    tripVault: { findUnique: jest.fn(), create: jest.fn() },
    walletAccount: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    tripMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    vaultTransaction: {
      create: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  const vaultPda = Keypair.generate().publicKey;
  const instruction = jest.fn().mockResolvedValue({
    programId: PROGRAM_ID,
    keys: [],
    data: Buffer.alloc(0),
  });
  // Anchor exposes both: accounts() for fully resolvable account sets, and
  // accountsPartial() where a PDA seed reads a field of the account itself.
  const anchorMethod = () => ({
    accounts: () => ({ instruction }),
    accountsPartial: () => ({ instruction }),
  });
  const solana = {
    isConfigured: true,
    program: {
      programId: PROGRAM_ID,
      methods: {
        initVault: anchorMethod,
        addMember: anchorMethod,
        deposit: anchorMethod,
      },
      account: {
        tripVault: {
          fetch: jest.fn().mockResolvedValue({ members: [] }),
        },
      },
    },
    usdcMint: Keypair.generate().publicKey,
    feePayer: Keypair.generate(),
    connection: { getAccountInfo: jest.fn() },
    vaultPda: jest.fn().mockReturnValue(vaultPda),
    treasuryAta: jest.fn().mockReturnValue(Keypair.generate().publicKey),
    ensureTreasuryAta: jest
      .fn()
      .mockResolvedValue(Keypair.generate().publicKey),
    getTokenBalance: jest.fn().mockResolvedValue(1_500_000n),
    buildUnsignedTx: jest.fn().mockResolvedValue('base64tx'),
    sendAsFeePayer: jest.fn().mockResolvedValue('sig'),
  };
  const trips = { sendVaultBalanceChanged: jest.fn() };
  return { prisma, solana, trips, vaultPda, instruction };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new TripVaultService(
    deps.prisma as never,
    deps.solana as never,
    deps.trips as never,
    new VaultSafetyService(deps.prisma as never, deps.solana as never),
  );
}

function vaultRow(
  vaultPda: PublicKey,
  overrides: { status?: string; usdcAta?: string } = {},
) {
  return {
    id: 1,
    tripId: 42,
    vaultPda: vaultPda.toBase58(),
    usdcAta: overrides.usdcAta ?? Keypair.generate().publicKey.toBase58(),
    thresholdMicro: 10_000_000n,
    dailyLimitMicro: 50_000_000n,
    status: overrides.status ?? 'ACTIVE',
  };
}

describe('TripVaultService', () => {
  it('throws when the trip has no vault', async () => {
    const deps = makeDeps();
    const { prisma, solana } = deps;
    prisma.tripVault.findUnique.mockResolvedValue(null);
    const service = makeService(deps);

    await expect(service.requireVault(42)).rejects.toThrow(NotFoundException);
  });

  it('returns the on-chain balance for an existing vault', async () => {
    const deps = makeDeps();
    const { prisma, solana, vaultPda } = deps;
    prisma.tripVault.findUnique.mockResolvedValue(vaultRow(vaultPda));
    const service = makeService(deps);

    const result = await service.getBalance(42);
    expect(result.balanceMicro).toBe(1_500_000n);
    expect(result.vaultPda).toBe(vaultPda.toBase58());
  });

  it('returns zero for a closed vault without reading the closed ATA', async () => {
    const deps = makeDeps();
    const { prisma, solana, vaultPda } = deps;
    prisma.tripVault.findUnique.mockResolvedValue(
      vaultRow(vaultPda, { status: 'CLOSED' }),
    );
    const service = makeService(deps);

    const result = await service.getBalance(42);
    expect(result.balanceMicro).toBe(0n);
    expect(result.vaultPda).toBe(vaultPda.toBase58());
    expect(solana.getTokenBalance).not.toHaveBeenCalled();
  });

  it('returns zero when the vault ATA is missing on chain', async () => {
    const deps = makeDeps();
    const { prisma, solana, vaultPda } = deps;
    prisma.tripVault.findUnique.mockResolvedValue(vaultRow(vaultPda));
    solana.getTokenBalance.mockRejectedValue(new Error('AccountNotFound'));
    const service = makeService(deps);

    const result = await service.getBalance(42);
    expect(result.balanceMicro).toBe(0n);
  });

  it('rejects a deposit from a user with no linked wallet', async () => {
    const deps = makeDeps();
    const { prisma, solana, vaultPda } = deps;
    prisma.tripVault.findUnique.mockResolvedValue(vaultRow(vaultPda));
    prisma.walletAccount.findUnique.mockResolvedValue(null);
    const service = makeService(deps);

    await expect(service.buildDepositTx(42, 7, 100_000n)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a non-positive deposit amount', async () => {
    const deps = makeDeps();
    const { prisma, solana } = deps;
    const service = makeService(deps);

    await expect(service.buildDepositTx(42, 7, 0n)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('stores a linked wallet public key', async () => {
    const deps = makeDeps();
    const { prisma, solana } = deps;
    const pubkey = Keypair.generate().publicKey.toBase58();
    prisma.walletAccount.upsert.mockResolvedValue({
      userId: 7,
      publicKey: pubkey,
    });
    const service = makeService(deps);

    const result = await service.linkWallet(7, pubkey);
    expect(result.publicKey).toBe(pubkey);
    expect(prisma.walletAccount.upsert).toHaveBeenCalled();
  });

  it('rejects a malformed wallet public key', async () => {
    const deps = makeDeps();
    const { prisma, solana } = deps;
    const service = makeService(deps);

    await expect(service.linkWallet(7, 'not-a-pubkey')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('blocks deleting a trip whose vault still holds funds', async () => {
    const deps = makeDeps();
    const { prisma, solana, vaultPda } = deps;
    prisma.tripVault.findUnique.mockResolvedValue(vaultRow(vaultPda));
    solana.getTokenBalance.mockResolvedValue(500_000n);
    const service = makeService(deps);

    await expect(service.assertDeletable(42)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('allows deleting a trip with an empty vault', async () => {
    const deps = makeDeps();
    const { prisma, solana, vaultPda } = deps;
    prisma.tripVault.findUnique.mockResolvedValue(vaultRow(vaultPda));
    solana.getTokenBalance.mockResolvedValue(0n);
    const service = makeService(deps);

    await expect(service.assertDeletable(42)).resolves.toBeUndefined();
  });

  it('allows deleting a trip that never had a vault', async () => {
    const deps = makeDeps();
    const { prisma, solana } = deps;
    prisma.tripVault.findUnique.mockResolvedValue(null);
    const service = makeService(deps);

    await expect(service.assertDeletable(42)).resolves.toBeUndefined();
  });

  it('skips members that already exist on chain when syncing', async () => {
    const deps = makeDeps();
    const { prisma, solana, vaultPda } = deps;
    prisma.tripVault.findUnique.mockResolvedValue(vaultRow(vaultPda));
    prisma.tripMember.findMany.mockResolvedValue([
      { userId: 7 },
      { userId: 8 },
    ]);
    const already = Keypair.generate().publicKey;
    const newbie = Keypair.generate().publicKey;
    prisma.walletAccount.findMany.mockResolvedValue([
      { userId: 7, publicKey: already.toBase58() },
      { userId: 8, publicKey: newbie.toBase58() },
    ]);
    solana.program.account.tripVault.fetch.mockResolvedValue({
      members: [{ owner: already, active: true }],
    });
    const service = makeService(deps);

    const added = await service.syncMembers(42);

    expect(added).toBe(1);
    expect(solana.sendAsFeePayer).toHaveBeenCalledTimes(1);
  });

  describe('assertMember and assertHost', () => {
    it('passes for an accepted member', async () => {
      const deps = makeDeps();
      deps.prisma.tripMember.findUnique.mockResolvedValue({
        inviteStatus: InviteStatus.ACCEPTED,
        role: TripMemberRole.MEMBER,
      });
      const service = makeService(deps);

      await expect(service.assertMember(42, 7)).resolves.toBeUndefined();
    });

    it('rejects a user who is not a trip member', async () => {
      const deps = makeDeps();
      deps.prisma.tripMember.findUnique.mockResolvedValue(null);
      const service = makeService(deps);

      await expect(service.assertMember(42, 7)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a member whose invite is still pending', async () => {
      const deps = makeDeps();
      deps.prisma.tripMember.findUnique.mockResolvedValue({
        inviteStatus: InviteStatus.PENDING,
        role: TripMemberRole.MEMBER,
      });
      const service = makeService(deps);

      await expect(service.assertMember(42, 7)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a non-host member from a host-only action', async () => {
      const deps = makeDeps();
      deps.prisma.tripMember.findUnique.mockResolvedValue({
        inviteStatus: InviteStatus.ACCEPTED,
        role: TripMemberRole.MEMBER,
      });
      const service = makeService(deps);

      await expect(service.assertHost(42, 7)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('passes assertHost for the trip host', async () => {
      const deps = makeDeps();
      deps.prisma.tripMember.findUnique.mockResolvedValue({
        inviteStatus: InviteStatus.ACCEPTED,
        role: TripMemberRole.HOST,
      });
      const service = makeService(deps);

      await expect(service.assertHost(42, 7)).resolves.toBeUndefined();
    });
  });

  describe('createVault', () => {
    function acceptedMember() {
      return {
        inviteStatus: InviteStatus.ACCEPTED,
        role: TripMemberRole.HOST,
      };
    }

    it('refuses to init a vault for a trip that does not exist', async () => {
      const deps = makeDeps();
      deps.prisma.trip.findUnique.mockResolvedValue(null);
      const service = makeService(deps);

      await expect(
        service.createVault(999, 7, 10_000_000n, 50_000_000n),
      ).rejects.toThrow(NotFoundException);
      expect(deps.solana.sendAsFeePayer).not.toHaveBeenCalled();
    });

    it('refuses to init a vault for a trip the caller does not belong to', async () => {
      const deps = makeDeps();
      deps.prisma.tripMember.findUnique.mockResolvedValue(null);
      const service = makeService(deps);

      await expect(
        service.createVault(42, 7, 10_000_000n, 50_000_000n),
      ).rejects.toThrow(ForbiddenException);
      expect(deps.solana.sendAsFeePayer).not.toHaveBeenCalled();
    });

    it('rejects a threshold above the configured cap', async () => {
      const deps = makeDeps();
      deps.prisma.tripMember.findUnique.mockResolvedValue(acceptedMember());
      const service = makeService(deps);

      await expect(
        service.createVault(
          42,
          7,
          MAX_THRESHOLD_MICRO + 1n,
          MAX_DAILY_LIMIT_MICRO,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(deps.solana.sendAsFeePayer).not.toHaveBeenCalled();
    });

    it('rejects a daily limit above the configured cap', async () => {
      const deps = makeDeps();
      deps.prisma.tripMember.findUnique.mockResolvedValue(acceptedMember());
      const service = makeService(deps);

      await expect(
        service.createVault(
          42,
          7,
          MAX_THRESHOLD_MICRO,
          MAX_DAILY_LIMIT_MICRO + 1n,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(deps.solana.sendAsFeePayer).not.toHaveBeenCalled();
    });

    it('creates the vault for a member with in-bounds limits', async () => {
      const deps = makeDeps();
      deps.prisma.tripMember.findUnique.mockResolvedValue(acceptedMember());
      deps.prisma.tripVault.findUnique.mockResolvedValue(null);
      deps.prisma.tripVault.create.mockResolvedValue(vaultRow(deps.vaultPda));
      const service = makeService(deps);

      await service.createVault(42, 7, 10_000_000n, 50_000_000n);

      expect(deps.solana.sendAsFeePayer).toHaveBeenCalledTimes(1);
      expect(deps.prisma.tripVault.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('syncMembersIfVault (M4)', () => {
    it('does nothing while web3 is disabled, without touching the DB or chain', async () => {
      const deps = makeDeps();
      (deps.solana as Record<string, unknown>).isEnabled = false;
      const service = makeService(deps);

      await expect(service.syncMembersIfVault(42)).resolves.toBe(0);
      expect(deps.prisma.tripVault.findUnique).not.toHaveBeenCalled();
      expect(deps.solana.sendAsFeePayer).not.toHaveBeenCalled();
    });

    it('does nothing when Solana is not configured', async () => {
      const deps = makeDeps();
      Object.assign(deps.solana, { isEnabled: true, isConfigured: false });
      const service = makeService(deps);

      await expect(service.syncMembersIfVault(42)).resolves.toBe(0);
      expect(deps.prisma.tripVault.findUnique).not.toHaveBeenCalled();
    });

    it('does nothing for a classic trip with no vault (no 404 warn per join)', async () => {
      const deps = makeDeps();
      Object.assign(deps.solana, { isEnabled: true });
      deps.prisma.tripVault.findUnique.mockResolvedValue(null);
      const service = makeService(deps);

      await expect(service.syncMembersIfVault(42)).resolves.toBe(0);
      expect(
        deps.solana.program.account.tripVault.fetch,
      ).not.toHaveBeenCalled();
    });

    it('syncs members when enabled and the trip has a vault', async () => {
      const deps = makeDeps();
      Object.assign(deps.solana, { isEnabled: true });
      deps.prisma.tripVault.findUnique.mockResolvedValue(
        vaultRow(deps.vaultPda),
      );
      deps.prisma.tripMember.findMany.mockResolvedValue([{ userId: 7 }]);
      deps.prisma.walletAccount.findMany.mockResolvedValue([
        { userId: 7, publicKey: Keypair.generate().publicKey.toBase58() },
      ]);
      const service = makeService(deps);

      await expect(service.syncMembersIfVault(42)).resolves.toBe(1);
    });
  });

  // ---------------------------------------------------------------------
  // S1: the credited amount comes out of the signed transaction.
  // ---------------------------------------------------------------------
  describe('submitDeposit (S1, S4, S7)', () => {
    const real = testSolana();
    const member = Keypair.generate();
    const otherTripVault = Keypair.generate().publicKey;

    function setup() {
      const deps = makeDeps();
      const vault = vaultRow(deps.vaultPda);
      // vault_ata is derived from the vault + mint by the program IDL.
      vault.usdcAta = getAssociatedTokenAddressSync(
        real.usdcMint,
        deps.vaultPda,
        true,
      ).toBase58();
      Object.assign(deps.solana, {
        feePayer: real.feePayer,
        usdcMint: real.usdcMint,
        treasuryAta: () => real.treasuryAta(),
        broadcastSigned: jest.fn().mockResolvedValue('broadcast'),
        confirmSigned: jest.fn().mockResolvedValue(undefined),
      });
      deps.solana.program.programId = real.program.programId;
      deps.prisma.tripVault.findUnique.mockResolvedValue(vault);
      deps.prisma.walletAccount.findUnique.mockResolvedValue({
        publicKey: member.publicKey.toBase58(),
      });
      Object.assign(deps.prisma.vaultTransaction, {
        create: jest.fn().mockResolvedValue({ id: 5 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
      });
      deps.prisma.user.findUnique.mockResolvedValue({ displayName: 'Ana' });
      return { deps, service: makeService(deps), vault };
    }

    async function depositTx(
      vaultPda: PublicKey,
      amount: bigint,
      over: {
        signer?: Keypair;
        owner?: PublicKey;
        treasuryAta?: PublicKey;
      } = {},
    ) {
      const signer = over.signer ?? member;
      return signTx(
        real,
        [
          await depositIx(real, {
            vault: vaultPda,
            owner: over.owner ?? signer.publicKey,
            amount,
            ...(over.treasuryAta ? { treasuryAta: over.treasuryAta } : {}),
          }),
        ],
        [signer],
      );
    }

    it('books the amount the transaction transfers, less the 0.1% skim', async () => {
      const { deps, service } = setup();
      const tx = await depositTx(deps.vaultPda, 5_000_000n);

      const signature = await service.submitDeposit(42, 7, tx);

      expect(signature).toBe(transactionSignature(tx));
      expect(deps.prisma.vaultTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'DEPOSIT',
          status: 'PENDING',
          userId: 7,
          amountMicro: 4_995_000n,
          signature,
        }),
      });
      expect(deps.prisma.vaultTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: 5, status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });
      expect(deps.trips.sendVaultBalanceChanged).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ amountMicro: '5000000' }),
      );
    });

    it('cannot be talked into a bigger credit: the API takes no amount at all', () => {
      const { service } = setup();
      // 3 parameters (tripId, userId, signedTx) — the body amount that let a
      // 1-micro deposit book 1000 USDC no longer has anywhere to go.
      expect(service.submitDeposit.length).toBe(3);
    });

    it('rejects a deposit into ANOTHER trip’s vault (cross-trip submit)', async () => {
      const { deps, service } = setup();
      const tx = await depositTx(otherTripVault, 1_000_000n);

      await expect(service.submitDeposit(42, 7, tx)).rejects.toThrow(
        /vault is not the expected account/,
      );
      expect(deps.solana.broadcastSigned).not.toHaveBeenCalled();
      expect(deps.prisma.vaultTransaction.create).not.toHaveBeenCalled();
    });

    it('rejects someone else’s genuinely signed deposit submitted under the caller', async () => {
      const { deps, service } = setup();
      const stranger = Keypair.generate();
      const tx = await depositTx(deps.vaultPda, 1_000_000n, {
        signer: stranger,
      });

      await expect(service.submitDeposit(42, 7, tx)).rejects.toThrow(
        /owner is not the expected account/,
      );
      expect(deps.prisma.vaultTransaction.create).not.toHaveBeenCalled();
    });

    it('rejects a deposit whose fee goes to a treasury the server did not choose', async () => {
      const { deps, service } = setup();
      const tx = await depositTx(deps.vaultPda, 1_000_000n, {
        treasuryAta: Keypair.generate().publicKey,
      });

      await expect(service.submitDeposit(42, 7, tx)).rejects.toThrow(
        /treasury_ata/,
      );
      expect(deps.solana.broadcastSigned).not.toHaveBeenCalled();
    });

    it('rejects any other instruction presented as a deposit', async () => {
      const { deps, service } = setup();
      const tx = signTx(
        real,
        [
          transferIx(real, {
            owner: member.publicKey,
            to: Keypair.generate().publicKey,
            amount: 1n,
          }),
        ],
        [member],
      );

      await expect(service.submitDeposit(42, 7, tx)).rejects.toThrow(
        BadRequestException,
      );
      expect(deps.solana.broadcastSigned).not.toHaveBeenCalled();
    });

    it('rejects a zero amount and a closed vault', async () => {
      const { deps, service, vault } = setup();
      await expect(
        service.submitDeposit(42, 7, await depositTx(deps.vaultPda, 0n)),
      ).rejects.toThrow(/positive/);

      deps.prisma.tripVault.findUnique.mockResolvedValue({
        ...vault,
        status: 'CLOSED',
      });
      await expect(
        service.submitDeposit(42, 7, await depositTx(deps.vaultPda, 1n)),
      ).rejects.toThrow(/closed/);
    });

    it('needs a linked wallet', async () => {
      const { deps, service } = setup();
      deps.prisma.walletAccount.findUnique.mockResolvedValue(null);
      await expect(
        service.submitDeposit(42, 7, await depositTx(deps.vaultPda, 1n)),
      ).rejects.toThrow(/Link a wallet/);
    });

    // S4: a landed-but-failed transaction must not be booked.
    it('leaves the row PENDING when the chain reports the transaction failed', async () => {
      const { deps, service } = setup();
      deps.solana.confirmSigned.mockRejectedValue(
        new Error('transaction failed on chain'),
      );

      await expect(
        service.submitDeposit(
          42,
          7,
          await depositTx(deps.vaultPda, 1_000_000n),
        ),
      ).rejects.toThrow(/failed on chain/);
      expect(deps.prisma.vaultTransaction.updateMany).not.toHaveBeenCalled();
      expect(deps.trips.sendVaultBalanceChanged).not.toHaveBeenCalled();
    });

    describe('S7: idempotent under the transaction signature', () => {
      const duplicate = () =>
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        });

      it('a second submit of an already-booked deposit credits nothing', async () => {
        const { deps, service } = setup();
        const tx = await depositTx(deps.vaultPda, 1_000_000n);
        deps.prisma.vaultTransaction.create.mockRejectedValue(duplicate());
        deps.prisma.vaultTransaction.findFirst.mockResolvedValue({
          id: 5,
          userId: 7,
          tripVaultId: 1,
          kind: 'DEPOSIT',
          status: 'CONFIRMED',
        });

        const signature = await service.submitDeposit(42, 7, tx);

        expect(signature).toBe(transactionSignature(tx));
        expect(deps.solana.broadcastSigned).not.toHaveBeenCalled();
        expect(deps.trips.sendVaultBalanceChanged).not.toHaveBeenCalled();
      });

      it('finishes a claim an earlier submit left PENDING, exactly once', async () => {
        const { deps, service } = setup();
        const tx = await depositTx(deps.vaultPda, 1_000_000n);
        deps.prisma.vaultTransaction.create.mockRejectedValue(duplicate());
        deps.prisma.vaultTransaction.findFirst.mockResolvedValue({
          id: 5,
          userId: 7,
          tripVaultId: 1,
          kind: 'DEPOSIT',
          status: 'PENDING',
        });
        // Losing the PENDING -> CONFIRMED race: someone else confirmed first.
        deps.prisma.vaultTransaction.updateMany.mockResolvedValue({ count: 0 });

        await service.submitDeposit(42, 7, tx);

        expect(deps.solana.broadcastSigned).toHaveBeenCalledTimes(1);
        expect(deps.trips.sendVaultBalanceChanged).not.toHaveBeenCalled();
      });

      it('refuses a signature already booked by another member or trip', async () => {
        const { deps, service } = setup();
        const tx = await depositTx(deps.vaultPda, 1_000_000n);
        deps.prisma.vaultTransaction.create.mockRejectedValue(duplicate());
        deps.prisma.vaultTransaction.findFirst.mockResolvedValue({
          id: 5,
          userId: 99,
          tripVaultId: 1,
          kind: 'DEPOSIT',
          status: 'CONFIRMED',
        });

        await expect(service.submitDeposit(42, 7, tx)).rejects.toThrow(
          /already submitted/,
        );
        expect(deps.solana.broadcastSigned).not.toHaveBeenCalled();
      });
    });
  });

  // S12
  it('linkWallet refuses a key another account already holds', async () => {
    const deps = makeDeps();
    deps.prisma.walletAccount.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      makeService(deps).linkWallet(7, Keypair.generate().publicKey.toBase58()),
    ).rejects.toThrow(/already linked/);
  });
});
