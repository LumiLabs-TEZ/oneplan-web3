import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  InviteStatus,
  Prisma,
  TripMemberRole,
  WalletProvider,
} from '@prisma/client';
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
    tripVault: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    walletAccount: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    // Interactive transactions run against the same mocks.
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma),
  );
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
  const identity = {
    refreshInBackground: jest.fn(),
    refreshStaleInBackground: jest.fn(),
  };
  return { prisma, solana, trips, identity, vaultPda, instruction };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new TripVaultService(
    deps.prisma as never,
    deps.solana as never,
    deps.trips as never,
    new VaultSafetyService(deps.prisma as never, deps.solana as never),
    deps.identity as never,
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
      const chain = Object.assign(deps.solana, {
        feePayer: real.feePayer,
        usdcMint: real.usdcMint,
        treasuryAta: () => real.treasuryAta(),
        broadcastSigned: jest.fn().mockResolvedValue('broadcast'),
        confirmSigned: jest.fn().mockResolvedValue(undefined),
        signatureLanded: jest.fn().mockResolvedValue(false),
      });
      deps.solana.program.programId = real.program.programId;
      deps.prisma.tripVault.findUnique.mockResolvedValue(vault);
      deps.prisma.walletAccount.findUnique.mockResolvedValue({
        publicKey: member.publicKey.toBase58(),
      });
      const vaultTx = Object.assign(deps.prisma.vaultTransaction, {
        create: jest.fn().mockResolvedValue({ id: 5 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
      });
      deps.prisma.user.findUnique.mockResolvedValue({ displayName: 'Ana' });
      return { deps, service: makeService(deps), vault, chain, vaultTx };
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
        where: { id: 5, status: { in: ['PENDING', 'FAILED'] } },
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

    it('I2: an expired blockhash fails the row this submit created and surfaces the 409', async () => {
      const { deps, service } = setup();
      const tx = await depositTx(deps.vaultPda, 1_000_000n);
      const expired = new ConflictException({
        code: 'tx_expired',
        message: 'expired',
      });
      const confirmSigned = jest.fn();
      Object.assign(deps.solana, {
        broadcastSigned: jest.fn().mockRejectedValue(expired),
        confirmSigned,
      });

      await expect(service.submitDeposit(42, 7, tx)).rejects.toBe(expired);

      // The transaction can never land, so the row is settled now rather than
      // left PENDING for the reconcile job to discover.
      expect(deps.prisma.vaultTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: 5, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      expect(confirmSigned).not.toHaveBeenCalled();
      expect(deps.trips.sendVaultBalanceChanged).not.toHaveBeenCalled();
    });

    it('leaves the row PENDING for reconcile on any other broadcast failure', async () => {
      const { deps, service } = setup();
      const tx = await depositTx(deps.vaultPda, 1_000_000n);
      Object.assign(deps.solana, {
        broadcastSigned: jest.fn().mockRejectedValue(new Error('rpc down')),
      });

      await expect(service.submitDeposit(42, 7, tx)).rejects.toThrow(
        'rpc down',
      );
      expect(deps.prisma.vaultTransaction.updateMany).not.toHaveBeenCalled();
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
        expect(deps.solana.signatureLanded).not.toHaveBeenCalled();
        expect(deps.prisma.vaultTransaction.updateMany).not.toHaveBeenCalled();
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

      // Submit A created the row and got a false "blockhash not found" from a
      // lagging RPC node, so it failed the row. Submit B, which had already
      // claimed the row as PENDING, broadcast the same bytes through a healthy
      // node and they landed. B's confirmation is proof, so B corrects the
      // FAILED row; otherwise the vault holds money settlement never counts.
      it('a confirmed broadcast also corrects a row a concurrent submit failed', async () => {
        const { deps, service, chain, vaultTx } = setup();
        const tx = await depositTx(deps.vaultPda, 1_000_000n);
        vaultTx.create.mockRejectedValue(duplicate());
        vaultTx.findFirst.mockResolvedValue({
          id: 5,
          userId: 7,
          tripVaultId: 1,
          kind: 'DEPOSIT',
          status: 'PENDING',
        });
        // Only the FAILED -> CONFIRMED move matches by the time B writes.
        vaultTx.updateMany.mockImplementation(
          (args: { where: { status: { in?: string[] } | string } }) =>
            Promise.resolve({
              count:
                typeof args.where.status === 'object' &&
                args.where.status.in?.includes('FAILED')
                  ? 1
                  : 0,
            }),
        );

        const signature = await service.submitDeposit(42, 7, tx);

        expect(signature).toBe(transactionSignature(tx));
        expect(chain.confirmSigned).toHaveBeenCalledTimes(1);
        expect(vaultTx.updateMany).toHaveBeenCalledTimes(1);
        expect(vaultTx.updateMany).toHaveBeenCalledWith({
          where: { id: 5, status: { in: ['PENDING', 'FAILED'] } },
          data: { status: 'CONFIRMED' },
        });
        expect(deps.trips.sendVaultBalanceChanged).toHaveBeenCalledWith(
          42,
          expect.objectContaining({ kind: 'DEPOSIT', amountMicro: '1000000' }),
        );
      });

      // A replay's broadcast can come back "blockhash not found" even though
      // the first submit's broadcast landed. Only the chain knows, so the
      // reused row is left PENDING for the reconcile job to ask.
      it('an expired blockhash on a replay leaves the reused PENDING row for reconcile', async () => {
        const { deps, service, chain, vaultTx } = setup();
        const tx = await depositTx(deps.vaultPda, 1_000_000n);
        vaultTx.create.mockRejectedValue(duplicate());
        vaultTx.findFirst.mockResolvedValue({
          id: 5,
          userId: 7,
          tripVaultId: 1,
          kind: 'DEPOSIT',
          status: 'PENDING',
        });
        const expired = new ConflictException({
          code: 'tx_expired',
          message: 'expired',
        });
        chain.broadcastSigned.mockRejectedValue(expired);

        await expect(service.submitDeposit(42, 7, tx)).rejects.toBe(expired);

        expect(vaultTx.updateMany).not.toHaveBeenCalled();
        expect(chain.confirmSigned).not.toHaveBeenCalled();
      });

      it('a resubmit of a FAILED deposit the chain shows landed confirms it once', async () => {
        const { deps, service, chain, vaultTx } = setup();
        const tx = await depositTx(deps.vaultPda, 1_000_000n);
        vaultTx.create.mockRejectedValue(duplicate());
        vaultTx.findFirst.mockResolvedValue({
          id: 5,
          userId: 7,
          tripVaultId: 1,
          kind: 'DEPOSIT',
          status: 'FAILED',
        });
        chain.signatureLanded.mockResolvedValue(true);

        const signature = await service.submitDeposit(42, 7, tx);

        expect(signature).toBe(transactionSignature(tx));
        expect(chain.signatureLanded).toHaveBeenCalledWith(signature);
        expect(vaultTx.updateMany).toHaveBeenCalledTimes(1);
        expect(vaultTx.updateMany).toHaveBeenCalledWith({
          where: { id: 5, status: 'FAILED' },
          data: { status: 'CONFIRMED' },
        });
        // Nothing to send: the transaction is already on chain.
        expect(chain.broadcastSigned).not.toHaveBeenCalled();
        expect(deps.trips.sendVaultBalanceChanged).toHaveBeenCalledWith(
          42,
          expect.objectContaining({ kind: 'DEPOSIT', amountMicro: '1000000' }),
        );
      });

      it('a landed FAILED resubmit that loses the flip race announces nothing', async () => {
        const { deps, service, chain, vaultTx } = setup();
        const tx = await depositTx(deps.vaultPda, 1_000_000n);
        vaultTx.create.mockRejectedValue(duplicate());
        vaultTx.findFirst.mockResolvedValue({
          id: 5,
          userId: 7,
          tripVaultId: 1,
          kind: 'DEPOSIT',
          status: 'FAILED',
        });
        chain.signatureLanded.mockResolvedValue(true);
        vaultTx.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.submitDeposit(42, 7, tx)).resolves.toBe(
          transactionSignature(tx),
        );
        expect(deps.trips.sendVaultBalanceChanged).not.toHaveBeenCalled();
      });

      it('a resubmit of a FAILED deposit that never landed is a 409 tx_expired', async () => {
        const { deps, service, chain, vaultTx } = setup();
        const tx = await depositTx(deps.vaultPda, 1_000_000n);
        vaultTx.create.mockRejectedValue(duplicate());
        vaultTx.findFirst.mockResolvedValue({
          id: 5,
          userId: 7,
          tripVaultId: 1,
          kind: 'DEPOSIT',
          status: 'FAILED',
        });
        chain.signatureLanded.mockResolvedValue(false);

        const error: unknown = await service
          .submitDeposit(42, 7, tx)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect(
          ((error as ConflictException).getResponse() as { code?: string })
            .code,
        ).toBe('tx_expired');
        expect(vaultTx.updateMany).not.toHaveBeenCalled();
        expect(chain.broadcastSigned).not.toHaveBeenCalled();
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

  it('linkWallet stores the provider it was given', async () => {
    const deps = makeDeps();
    const key = Keypair.generate().publicKey.toBase58();
    deps.prisma.walletAccount.findUnique.mockResolvedValue(null);
    deps.prisma.walletAccount.upsert.mockResolvedValue({
      userId: 7,
      publicKey: key,
    });
    await makeService(deps).linkWallet(7, key, WalletProvider.MWA);
    expect(deps.prisma.walletAccount.upsert).toHaveBeenCalledTimes(1);
    const [args] = deps.prisma.walletAccount.upsert.mock.calls[0] as [
      {
        create: { provider?: WalletProvider };
        update: { provider?: WalletProvider };
      },
    ];
    expect(args.create.provider).toBe(WalletProvider.MWA);
    expect(args.update.provider).toBe(WalletProvider.MWA);
  });

  it('linkWallet re-linking the same key is idempotent even inside an open vault', async () => {
    const deps = makeDeps();
    const key = Keypair.generate().publicKey.toBase58();
    deps.prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: key,
    });
    deps.prisma.tripVault.findFirst.mockResolvedValue({ tripId: 42 });
    deps.prisma.walletAccount.upsert.mockResolvedValue({
      userId: 7,
      publicKey: key,
    });
    await expect(makeService(deps).linkWallet(7, key)).resolves.toMatchObject({
      publicKey: key,
    });
    expect(deps.prisma.tripVault.findFirst).not.toHaveBeenCalled();
  });

  it('linkWallet re-linking the same key keeps the stored provider', async () => {
    const deps = makeDeps();
    const key = Keypair.generate().publicKey.toBase58();
    deps.prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: key,
      provider: WalletProvider.MWA,
    });
    deps.prisma.walletAccount.upsert.mockResolvedValue({
      userId: 7,
      publicKey: key,
    });
    // Default provider (PRIVY), as the Android deposit flow's POST /trips/:id/vault/wallet sends.
    await makeService(deps).linkWallet(7, key);
    const [args] = deps.prisma.walletAccount.upsert.mock.calls[0] as [
      { update: unknown },
    ];
    expect(args.update).toEqual({ publicKey: key });
  });

  it('linkWallet with a SIWS-proven MWA link upgrades a same-key PRIVY row', async () => {
    const deps = makeDeps();
    const key = Keypair.generate().publicKey.toBase58();
    deps.prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: key,
      provider: WalletProvider.PRIVY,
    });
    deps.prisma.walletAccount.upsert.mockResolvedValue({
      userId: 7,
      publicKey: key,
    });
    await makeService(deps).linkWallet(7, key, WalletProvider.MWA);
    const [args] = deps.prisma.walletAccount.upsert.mock.calls[0] as [
      { update: unknown },
    ];
    expect(args.update).toEqual({
      publicKey: key,
      provider: WalletProvider.MWA,
    });
  });

  it('linkWallet refuses switching keys while the user is in an open vault', async () => {
    const deps = makeDeps();
    deps.prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: Keypair.generate().publicKey.toBase58(),
    });
    deps.prisma.tripVault.findFirst.mockResolvedValue({ tripId: 42 });
    const err = await makeService(deps)
      .linkWallet(
        7,
        Keypair.generate().publicKey.toBase58(),
        WalletProvider.MWA,
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: 'wallet_locked_by_vault',
      tripId: 42,
    });
    expect(deps.prisma.walletAccount.upsert).not.toHaveBeenCalled();
  });

  it('linkWallet allows switching keys when no open vault holds the old one', async () => {
    const deps = makeDeps();
    const key = Keypair.generate().publicKey.toBase58();
    deps.prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: Keypair.generate().publicKey.toBase58(),
    });
    deps.prisma.tripVault.findFirst.mockResolvedValue(null);
    deps.prisma.walletAccount.upsert.mockResolvedValue({
      userId: 7,
      publicKey: key,
    });
    await expect(makeService(deps).linkWallet(7, key)).resolves.toMatchObject({
      publicKey: key,
    });
  });
  it('linkWallet switching keys drops the old key Seeker identity', async () => {
    const deps = makeDeps();
    const key = Keypair.generate().publicKey.toBase58();
    deps.prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: Keypair.generate().publicKey.toBase58(),
      provider: WalletProvider.MWA,
      seekerGenesisMint: 'OldMint',
      skrDomain: 'old',
    });
    deps.prisma.walletAccount.upsert.mockResolvedValue({
      userId: 7,
      publicKey: key,
    });
    await makeService(deps).linkWallet(7, key, WalletProvider.MWA);
    const [args] = deps.prisma.walletAccount.upsert.mock.calls[0] as [
      { update: unknown },
    ];
    expect(args.update).toEqual({
      publicKey: key,
      provider: WalletProvider.MWA,
      seekerGenesisMint: null,
      seekerCheckedAt: null,
      skrDomain: null,
      skrCheckedAt: null,
    });
  });

  describe('linkWallet reclaiming a key another account linked without proof', () => {
    const CALLER = 7;
    const OTHER = 9;

    /** findUnique answers by userId (the caller's row) or by publicKey (the key's holder). */
    function setup(opts: {
      holder?: { userId: number; provider: WalletProvider } | null;
      callerRow?: { publicKey: string } | null;
      openVaultFor?: number[];
    }) {
      const deps = makeDeps();
      const key = Keypair.generate().publicKey.toBase58();
      const holderRow = opts.holder
        ? { ...opts.holder, publicKey: key, seekerGenesisMint: 'TheirMint' }
        : null;
      deps.prisma.walletAccount.findUnique.mockImplementation(
        ({ where }: { where: { userId?: number; publicKey?: string } }) =>
          Promise.resolve(
            where.publicKey !== undefined
              ? holderRow
              : opts.callerRow
                ? { userId: CALLER, ...opts.callerRow }
                : null,
          ),
      );
      deps.prisma.tripVault.findFirst.mockImplementation(
        (args: {
          where: { trip: { members: { some: { userId: number } } } };
        }) =>
          Promise.resolve(
            opts.openVaultFor?.includes(args.where.trip.members.some.userId)
              ? { tripId: 77 }
              : null,
          ),
      );
      deps.prisma.walletAccount.upsert.mockResolvedValue({
        userId: CALLER,
        publicKey: key,
      });
      const service = makeService(deps);
      const warn = jest
        .spyOn(
          (service as unknown as { logger: { warn: () => void } }).logger,
          'warn',
        )
        .mockImplementation(() => undefined);
      return { deps, key, service, warn };
    }

    it('keeps the 409 when another account proved the key with SIWS (MWA)', async () => {
      const { deps, key, service } = setup({
        holder: { userId: OTHER, provider: WalletProvider.MWA },
      });
      const err = await service
        .linkWallet(CALLER, key, WalletProvider.MWA)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as Error).message).toMatch(/already linked/);
      expect(deps.prisma.walletAccount.deleteMany).not.toHaveBeenCalled();
      expect(deps.prisma.walletAccount.upsert).not.toHaveBeenCalled();
    });

    it('refuses with wallet_claimed_in_open_vault when the unproven holder is in an open vault', async () => {
      const { deps, key, service, warn } = setup({
        holder: { userId: OTHER, provider: WalletProvider.PRIVY },
        openVaultFor: [OTHER],
      });
      const err = await service
        .linkWallet(CALLER, key, WalletProvider.MWA)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      const body = (err as ConflictException).getResponse();
      expect(body).toMatchObject({ code: 'wallet_claimed_in_open_vault' });
      // The other user's trip is none of the caller's business.
      expect(body).not.toHaveProperty('tripId');
      const [vaultQuery] = deps.prisma.tripVault.findFirst.mock.calls[0] as [
        { where: { trip: unknown } },
      ];
      expect(vaultQuery.where.trip).toEqual({
        members: {
          some: { userId: OTHER, inviteStatus: InviteStatus.ACCEPTED },
        },
      });
      expect(deps.prisma.walletAccount.deleteMany).not.toHaveBeenCalled();
      expect(deps.prisma.walletAccount.upsert).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it('deletes the unproven row and links the caller in one transaction when no open vault holds it', async () => {
      const { deps, key, service, warn } = setup({
        holder: { userId: OTHER, provider: WalletProvider.PRIVY },
      });
      await expect(
        service.linkWallet(CALLER, key, WalletProvider.MWA),
      ).resolves.toMatchObject({ userId: CALLER, publicKey: key });
      expect(deps.prisma.$transaction).toHaveBeenCalledTimes(1);
      // Only that user's still-unproven row for this key: an upgrade to MWA in between wins.
      expect(deps.prisma.walletAccount.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: OTHER,
          publicKey: key,
          provider: WalletProvider.PRIVY,
        },
      });
      const [args] = deps.prisma.walletAccount.upsert.mock.calls[0] as [
        {
          where: { userId: number };
          create: Record<string, unknown>;
        },
      ];
      expect(args.where).toEqual({ userId: CALLER });
      // A fresh row: the old holder's Seeker identity does not carry over.
      expect(args.create).toEqual({
        userId: CALLER,
        publicKey: key,
        provider: WalletProvider.MWA,
      });
      expect(
        deps.prisma.walletAccount.deleteMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        deps.prisma.walletAccount.upsert.mock.invocationCallOrder[0],
      );
      expect(warn).toHaveBeenCalledTimes(1);
      const [line] = warn.mock.calls[0] as unknown as [string];
      expect(line).toContain(`userId ${OTHER}`);
      expect(line).toContain(`userId ${CALLER}`);
      expect(line).toContain(key);
      expect(line).toContain('SIWS');
    });

    it('maps a P2002 race inside the reclaim transaction to the existing 409', async () => {
      const { deps, key, service, warn } = setup({
        holder: { userId: OTHER, provider: WalletProvider.PRIVY },
      });
      deps.prisma.walletAccount.deleteMany.mockResolvedValue({ count: 0 });
      deps.prisma.walletAccount.upsert.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.linkWallet(CALLER, key, WalletProvider.MWA),
      ).rejects.toThrow(/already linked/);
      expect(deps.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it('links without an audit line when the holder released the key in the meantime', async () => {
      const { deps, key, service, warn } = setup({
        holder: { userId: OTHER, provider: WalletProvider.PRIVY },
      });
      deps.prisma.walletAccount.deleteMany.mockResolvedValue({ count: 0 });
      await expect(
        service.linkWallet(CALLER, key, WalletProvider.MWA),
      ).resolves.toMatchObject({ userId: CALLER, publicKey: key });
      expect(warn).not.toHaveBeenCalled();
    });

    it('never reclaims through the PRIVY-default routes', async () => {
      const { deps, key, service } = setup({
        holder: { userId: OTHER, provider: WalletProvider.PRIVY },
      });
      deps.prisma.walletAccount.upsert.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(service.linkWallet(CALLER, key)).rejects.toThrow(
        /already linked/,
      );
      expect(deps.prisma.walletAccount.deleteMany).not.toHaveBeenCalled();
      expect(deps.prisma.$transaction).not.toHaveBeenCalled();
    });

    it("still applies the caller's own re-link guard before reclaiming", async () => {
      const { deps, key, service } = setup({
        holder: { userId: OTHER, provider: WalletProvider.PRIVY },
        callerRow: { publicKey: Keypair.generate().publicKey.toBase58() },
        openVaultFor: [CALLER],
      });
      const err = await service
        .linkWallet(CALLER, key, WalletProvider.MWA)
        .catch((e: unknown) => e);
      expect((err as ConflictException).getResponse()).toMatchObject({
        code: 'wallet_locked_by_vault',
      });
      expect(deps.prisma.walletAccount.deleteMany).not.toHaveBeenCalled();
      expect(deps.prisma.walletAccount.upsert).not.toHaveBeenCalled();
    });
  });

  it('walletBalance exposes the Seeker identity of an MWA wallet', async () => {
    const deps = makeDeps();
    const row = {
      userId: 7,
      publicKey: Keypair.generate().publicKey.toBase58(),
      provider: WalletProvider.MWA,
      seekerGenesisMint: 'SgtMint',
      seekerCheckedAt: null,
      skrDomain: 'alice',
    };
    deps.prisma.walletAccount.findUnique.mockResolvedValue(row);
    await expect(makeService(deps).walletBalance(7)).resolves.toMatchObject({
      skrDomain: 'alice',
      isSeeker: true,
    });
    expect(deps.identity.refreshStaleInBackground).toHaveBeenCalledWith([row]);
  });

  it('walletBalance hides stored identity on a PRIVY wallet (linked without proof)', async () => {
    const deps = makeDeps();
    deps.prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: Keypair.generate().publicKey.toBase58(),
      provider: WalletProvider.PRIVY,
      seekerGenesisMint: 'SgtMint',
      seekerCheckedAt: new Date(),
      skrDomain: 'alice',
    });
    // Even on the no-token-account path.
    deps.solana.getTokenBalance.mockRejectedValue(new Error('no ata'));
    await expect(makeService(deps).walletBalance(7)).resolves.toMatchObject({
      balanceMicro: 0n,
      skrDomain: null,
      isSeeker: false,
    });
  });

  it('walletBalance without a wallet reports no identity', async () => {
    const deps = makeDeps();
    await expect(makeService(deps).walletBalance(7)).resolves.toEqual({
      publicKey: null,
      usdcAta: null,
      balanceMicro: 0n,
      skrDomain: null,
      isSeeker: false,
    });
    expect(deps.identity.refreshStaleInBackground).not.toHaveBeenCalled();
  });

  it('identitiesForTrip gates identity on MWA and refreshes stale rows', async () => {
    const deps = makeDeps();
    deps.prisma.tripMember.findMany.mockResolvedValue([
      { userId: 7 },
      { userId: 8 },
    ]);
    const wallets = [
      {
        userId: 7,
        provider: WalletProvider.MWA,
        skrDomain: 'alice',
        seekerGenesisMint: 'SgtMint',
        seekerCheckedAt: null,
      },
      {
        userId: 8,
        provider: WalletProvider.PRIVY,
        skrDomain: 'mallory',
        seekerGenesisMint: 'StolenMint',
        seekerCheckedAt: new Date(),
      },
    ];
    deps.prisma.walletAccount.findMany.mockResolvedValue(wallets);
    await expect(makeService(deps).identitiesForTrip(42)).resolves.toEqual([
      { userId: 7, skrDomain: 'alice', isSeeker: true },
      { userId: 8, skrDomain: null, isSeeker: false },
    ]);
    expect(deps.prisma.tripMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: 42, inviteStatus: InviteStatus.ACCEPTED },
      }),
    );
    expect(deps.prisma.walletAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: [7, 8] } } }),
    );
    expect(deps.identity.refreshStaleInBackground).toHaveBeenCalledWith(
      wallets,
    );
  });
});
