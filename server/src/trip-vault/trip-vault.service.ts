import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  InviteStatus,
  Prisma,
  TripMemberRole,
  TripVault,
  VaultStatus,
  VaultTxKind,
  VaultTxStatus,
  WalletAccount,
} from '@prisma/client';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { PrismaService } from '../prisma/prisma.service';
import { TripsHandler } from '../realtime/handlers/trips.handler';
import { SolanaService } from '../solana/solana.service';
import {
  assertInstructionAccounts,
  decodeVaultInstruction,
  transactionSignature,
} from '../solana/tx-verify';
import { VaultSafetyService } from '../solana/vault-safety.service';

function toPublicKey(value: string, field: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new BadRequestException(`${field} is not a valid Solana public key`);
  }
}

/// How long a vault balance is served without asking the chain again.
///
/// Every member's device polls this, so one trip of three was three reads of
/// the same account, and the public devnet endpoint rate-limits per IP — which
/// is what made a phone show itself as offline while holding a stale number.
/// Short enough that a balance is never meaningfully old, and every path that
/// moves money clears it anyway.
const BALANCE_CACHE_MS = 15_000;

/** 3 USDC: above it a second member must approve a spend. */
export const DEFAULT_THRESHOLD_MICRO = 3_000_000n;
/** 100 USDC a day. */
export const DEFAULT_DAILY_LIMIT_MICRO = 100_000_000n;

/// Upper bounds on caller-supplied vault limits. Without these, whoever wins
/// the race to create a trip's vault (see assertMember on createVault — this
/// closes the race, but the value is still caller-chosen) could set a
/// threshold so high every spend needs only one signature. Generous enough
/// that no real trip budget needs more; the defaults above sit far under both.
export const MAX_THRESHOLD_MICRO = 1_000_000_000n; // 1,000 USDC
export const MAX_DAILY_LIMIT_MICRO = 10_000_000_000n; // 10,000 USDC

/// Matches the program's own threshold. Below it the chain lets any active
/// member approve, and the app has to agree or it offers a button that fails.
const MIN_APPROVERS_TO_RESTRICT = 2;

@Injectable()
export class TripVaultService {
  private readonly balanceCache = new Map<
    number,
    { balanceMicro: bigint; expiresAt: number }
  >();

  private readonly logger = new Logger(TripVaultService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly solana: SolanaService,
    private readonly trips: TripsHandler,
    private readonly safety: VaultSafetyService,
  ) {}

  private assertConfigured(): void {
    if (!this.solana.isConfigured) {
      throw new ServiceUnavailableException(
        'Solana is not configured on this server',
      );
    }
  }

  /**
   * Every vault endpoint is nested under a trip, so every one of them needs
   * this: without it any logged-in user can read or act on another trip's
   * ledger by guessing/incrementing the tripId in the URL. Mirrors
   * TripsService's own private assertMember (trips.service.ts) — duplicated
   * rather than shared to avoid a circular module dependency (TripsModule
   * already imports TripVaultModule).
   */
  async assertMember(tripId: number, userId: number): Promise<void> {
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!member || member.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You are not a member of this trip');
    }
  }

  /** Membership plus HOST role, for the vault actions only the trip's creator may take. */
  async assertHost(tripId: number, userId: number): Promise<void> {
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!member || member.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You are not a member of this trip');
    }
    if (member.role !== TripMemberRole.HOST) {
      throw new ForbiddenException('Only the trip host can do this');
    }
  }

  async requireVault(tripId: number): Promise<TripVault> {
    const vault = await this.prisma.tripVault.findUnique({ where: { tripId } });
    if (!vault) {
      throw new NotFoundException(`Trip ${tripId} has no vault`);
    }
    return vault;
  }

  async linkWallet(userId: number, publicKey: string): Promise<WalletAccount> {
    const key = toPublicKey(publicKey, 'publicKey');
    try {
      return await this.prisma.walletAccount.upsert({
        where: { userId },
        create: { userId, publicKey: key.toBase58() },
        update: { publicKey: key.toBase58() },
      });
    } catch (error) {
      // public_key is unique (S12): another account already holds this key.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This wallet is already linked to another account',
        );
      }
      throw error;
    }
  }

  /**
   * The caller's own wallet: where they hold USDC before contributing it.
   *
   * Money has to pass through here to reach the vault, because the deposit
   * instruction is what records who contributed. A transfer straight into the
   * vault from an exchange has no attributable sender, and settlement is built
   * on knowing who put in what.
   */
  async walletBalance(userId: number): Promise<{
    publicKey: string | null;
    usdcAta: string | null;
    balanceMicro: bigint;
  }> {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) {
      return { publicKey: null, usdcAta: null, balanceMicro: 0n };
    }
    const owner = new PublicKey(wallet.publicKey);
    const ata = getAssociatedTokenAddressSync(this.solana.usdcMint, owner);
    try {
      return {
        publicKey: wallet.publicKey,
        usdcAta: ata.toBase58(),
        balanceMicro: await this.solana.getTokenBalance(ata),
      };
    } catch {
      // No token account yet, which is what a wallet that has never held USDC
      // looks like. Zero is the honest answer, not an error.
      return {
        publicKey: wallet.publicKey,
        usdcAta: ata.toBase58(),
        balanceMicro: 0n,
      };
    }
  }

  /**
   * The vault with the defaults the create screen would have used, made if
   * the trip has none. For flows that need a ledger to write to before anyone
   * has chosen to deposit — a member paying from their own wallet.
   */
  async ensureDefaultVault(tripId: number, userId: number): Promise<TripVault> {
    const existing = await this.prisma.tripVault.findUnique({
      where: { tripId },
    });
    if (existing) {
      return existing;
    }
    const vault = await this.createVault(
      tripId,
      userId,
      DEFAULT_THRESHOLD_MICRO,
      DEFAULT_DAILY_LIMIT_MICRO,
    );
    await this.syncMembers(tripId);
    return vault;
  }

  async createVault(
    tripId: number,
    // Also used to gate creation below; the on-chain authority is still the
    // server fee payer, so this has no effect on what gets created.
    userId: number,
    thresholdMicro: bigint,
    dailyLimitMicro: bigint,
  ): Promise<TripVault> {
    this.assertConfigured();

    // Without this, POST-ing a not-yet-created trip id sends a real init_vault
    // (and pays real rent) for a trip that may never exist — a cheap SOL drain
    // and, if the id is later reused, a permanent block on the real trip ever
    // getting a vault (the PDA is already initialized).
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }
    await this.assertMember(tripId, userId);

    if (thresholdMicro <= 0n || dailyLimitMicro < thresholdMicro) {
      throw new BadRequestException(
        'thresholdMicro must be positive and dailyLimitMicro must be at least thresholdMicro',
      );
    }
    if (
      thresholdMicro > MAX_THRESHOLD_MICRO ||
      dailyLimitMicro > MAX_DAILY_LIMIT_MICRO
    ) {
      // Otherwise whoever creates the vault first picks a threshold so high
      // every spend clears with one signature — the vault's whole approval
      // model is a caller-supplied number with no cap.
      throw new BadRequestException(
        `thresholdMicro must be at most ${MAX_THRESHOLD_MICRO} and dailyLimitMicro at most ${MAX_DAILY_LIMIT_MICRO}`,
      );
    }

    const existing = await this.prisma.tripVault.findUnique({
      where: { tripId },
    });
    if (existing) {
      return existing;
    }

    // No wallet check: the vault authority is the server fee payer, not the
    // creator, so requiring a linked wallet here blocked trip creation for
    // nothing. Members link a wallet when they first open the vault, and
    // syncMembers only adds the ones that have.
    const vaultPda = this.solana.vaultPda(tripId);
    const usdcAta = getAssociatedTokenAddressSync(
      this.solana.usdcMint,
      vaultPda,
      true,
    );

    // Phase 1 keeps vault creation server-driven, so the fee payer is recorded as
    // the on-chain authority. Once the client can co-sign, pass the trip
    // creator's key here instead.
    const ix = await this.solana.program.methods
      .initVault(
        new BN(tripId),
        new BN(thresholdMicro.toString()),
        new BN(dailyLimitMicro.toString()),
      )
      .accounts({
        usdcMint: this.solana.usdcMint,
        authority: this.solana.feePayer.publicKey,
        server: this.solana.feePayer.publicKey,
      })
      .instruction();

    const signature = await this.solana.sendAsFeePayer([ix]);
    this.logger.log(`init_vault for trip ${tripId}: ${signature}`);

    // Same window as init: deposit skim needs a live treasury ATA, and creating
    // it here means the first deposit is not the first time it is noticed missing.
    await this.solana.ensureTreasuryAta();

    return this.prisma.tripVault.create({
      data: {
        tripId,
        vaultPda: vaultPda.toBase58(),
        usdcAta: usdcAta.toBase58(),
        thresholdMicro,
        dailyLimitMicro,
      },
    });
  }

  async hasVault(tripId: number): Promise<boolean> {
    const vault = await this.prisma.tripVault.findUnique({
      where: { tripId },
      select: { id: true },
    });
    return vault !== null;
  }

  /**
   * syncMembers for callers that must not care whether the trip has a vault:
   * a no-op unless web3 is enabled and configured and the trip has one.
   */
  async syncMembersIfVault(tripId: number): Promise<number> {
    if (!this.solana.isEnabled || !this.solana.isConfigured) {
      return 0;
    }
    if (!(await this.hasVault(tripId))) {
      return 0;
    }
    return this.syncMembers(tripId);
  }

  /**
   * Adds every accepted trip member that has a linked wallet but is not yet in
   * the vault's on-chain member table. Safe to call repeatedly.
   */
  async syncMembers(tripId: number): Promise<number> {
    this.assertConfigured();
    const vault = await this.requireVault(tripId);
    const vaultPda = new PublicKey(vault.vaultPda);

    const members = await this.prisma.tripMember.findMany({
      where: { tripId, inviteStatus: InviteStatus.ACCEPTED },
      select: { userId: true },
    });
    const wallets = await this.prisma.walletAccount.findMany({
      where: { userId: { in: members.map((m) => m.userId) } },
    });

    const onChain = await this.solana.program.account.tripVault.fetch(vaultPda);
    const known = new Set(
      (onChain.members as { owner: PublicKey; active: boolean }[])
        .filter((m) => m.active)
        .map((m) => m.owner.toBase58()),
    );

    let added = 0;
    for (const wallet of wallets) {
      if (known.has(wallet.publicKey)) {
        continue;
      }

      const owner = new PublicKey(wallet.publicKey);
      const ix = await this.solana.program.methods
        .addMember()
        .accountsPartial({
          vault: vaultPda,
          owner,
          authority: this.solana.feePayer.publicKey,
        })
        .instruction();
      await this.solana.sendAsFeePayer([ix]);
      added += 1;
    }

    if (added > 0) {
      this.logger.log(`synced ${added} member(s) for trip ${tripId}`);
    }
    return added;
  }

  /**
   * Records on chain whether a member may approve an above-threshold spend.
   *
   * The chain keeps one bit; the app keeps the difference between host and
   * co-host. Best effort by design: a trip whose vault is not reachable still
   * has to be able to name its co-host, and the next sync will carry the
   * decision across.
   */
  async setMemberRole(
    tripId: number,
    userId: number,
    canApprove: boolean,
  ): Promise<void> {
    this.assertConfigured();
    const vault = await this.requireVault(tripId);
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) {
      return;
    }

    const vaultPda = new PublicKey(vault.vaultPda);
    const owner = new PublicKey(wallet.publicKey);
    const onChain = await this.solana.program.account.tripVault.fetch(vaultPda);
    const seated = (onChain.members as { owner: PublicKey }[]).some((m) =>
      m.owner.equals(owner),
    );
    if (!seated) {
      return;
    }

    const ix = await this.solana.program.methods
      .setMemberRole(canApprove ? 1 : 0)
      .accountsPartial({
        vault: vaultPda,
        owner,
        server: this.solana.feePayer.publicKey,
      })
      .instruction();
    await this.solana.sendAsFeePayer([ix]);
  }

  /**
   * Pushes every approver the app knows about onto the chain.
   *
   * Called after a member links a wallet, which is the first moment their
   * Member account exists — a role set before that had nowhere to go.
   */
  async syncRoles(tripId: number): Promise<void> {
    const approvers = await this.prisma.tripMember.findMany({
      where: {
        tripId,
        inviteStatus: InviteStatus.ACCEPTED,
        role: { in: [TripMemberRole.HOST, TripMemberRole.CO_HOST] },
      },
      select: { userId: true },
    });
    for (const approver of approvers) {
      await this.setMemberRole(tripId, approver.userId, true);
    }
  }

  /**
   * The members a trip allows to approve an above-threshold spend, or null when
   * it allows anyone.
   *
   * Mirrors the rule the program enforces: the restriction applies only once a
   * trip has at least two approvers, so a trip whose sole approver raised the
   * payment is not left unable to pay it. Null rather than the whole member
   * list, so a caller can tell "anyone" from "these people".
   */
  async approverUserIds(tripId: number): Promise<number[] | null> {
    const approvers = await this.prisma.tripMember.findMany({
      where: {
        tripId,
        inviteStatus: InviteStatus.ACCEPTED,
        role: { in: [TripMemberRole.HOST, TripMemberRole.CO_HOST] },
      },
      select: { userId: true },
    });
    return approvers.length >= MIN_APPROVERS_TO_RESTRICT
      ? approvers.map((approver) => approver.userId)
      : null;
  }

  /**
   * Mirrors the vault having closed on chain.
   *
   * Nothing wrote this before, so a settled vault stayed ACTIVE here forever:
   * the drift check reads every active vault, and would have gone on reading a
   * closed one's empty account and reporting the gap every five minutes.
   */
  async markClosed(tripId: number): Promise<void> {
    await this.prisma.tripVault.update({
      where: { tripId },
      data: { status: VaultStatus.CLOSED },
    });
    this.invalidateBalance(tripId);
  }

  async getBalance(tripId: number): Promise<{
    balanceMicro: bigint;
    vaultPda: string;
    usdcAta: string;
    treasuryAta: string;
    spendRecipientAta: string | null;
  }> {
    const vault = await this.requireVault(tripId);

    const treasuryAta = this.solana.treasuryAta().toBase58();
    let spendRecipientAta: string | null = null;
    try {
      spendRecipientAta = getAssociatedTokenAddressSync(
        this.solana.usdcMint,
        this.solana.receiverPublicKey,
      ).toBase58();
    } catch {
      // Balance reads must work before payout keys are configured.
    }

    const accounts = {
      vaultPda: vault.vaultPda,
      usdcAta: vault.usdcAta,
      treasuryAta,
      spendRecipientAta,
    };

    // After settlement the ATA (and often the PDA) are closed for rent reclaim.
    // Clients still call this to ask "does this trip have a vault?" — a missing
    // account must not look like "no vault", or ended trips fall back to the
    // pre-web3 settlement UI.
    if (vault.status === VaultStatus.CLOSED) {
      return { balanceMicro: 0n, ...accounts };
    }

    const cached = this.balanceCache.get(tripId);
    if (cached && cached.expiresAt > Date.now()) {
      return { balanceMicro: cached.balanceMicro, ...accounts };
    }

    let balanceMicro = 0n;
    try {
      balanceMicro = await this.solana.getTokenBalance(
        new PublicKey(vault.usdcAta),
      );
    } catch {
      // ATA not created yet, or already closed while DB still says ACTIVE.
      balanceMicro = 0n;
    }
    this.balanceCache.set(tripId, {
      balanceMicro,
      expiresAt: Date.now() + BALANCE_CACHE_MS,
    });
    return { balanceMicro, ...accounts };
  }

  /**
   * Drops the cached balance for a trip.
   *
   * Called by whatever moved the money. Someone who has just deposited should
   * see their own deposit, and a few seconds of "did that work?" is worse than
   * the RPC call the cache saves.
   */
  invalidateBalance(tripId: number): void {
    this.balanceCache.delete(tripId);
  }

  /**
   * Builds the deposit transaction for the member to sign. The server signs as
   * fee payer; the member signs as the token authority.
   */
  async buildDepositTx(
    tripId: number,
    userId: number,
    amountMicro: bigint,
  ): Promise<string> {
    this.assertConfigured();

    if (amountMicro <= 0n) {
      throw new BadRequestException('amountMicro must be positive');
    }

    const vault = await this.requireVault(tripId);
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new BadRequestException('Link a wallet before depositing');
    }

    // Existing vaults may predate ensureTreasuryAta-on-create; do it here too.
    await this.solana.ensureTreasuryAta();

    const owner = new PublicKey(wallet.publicKey);
    const ownerAta = getAssociatedTokenAddressSync(this.solana.usdcMint, owner);

    const ix = await this.solana.program.methods
      .deposit(new BN(amountMicro.toString()))
      .accountsPartial({
        vault: new PublicKey(vault.vaultPda),
        treasuryAta: this.solana.treasuryAta(),
        ownerAta,
        owner,
        usdcMint: this.solana.usdcMint,
      })
      .instruction();

    return this.solana.buildUnsignedTx([ix]);
  }

  /**
   * Submits a deposit the member signed on device and returns its signature.
   *
   * Deposits go through the server rather than straight to an RPC node because
   * the server is the fee payer and has already partial-signed the transaction.
   * Without this the signed bytes would have nowhere to go and the deposit would
   * silently never land.
   *
   * The signed transaction is DECODED here and the ledger is written from what
   * it says, never from the request body (audit S1): the program, the
   * `deposit` discriminator, this trip's vault PDA and token account, the
   * caller's own linked wallet as signer and token owner, and the amount all
   * come out of the bytes. A body-supplied amount let a 1-micro deposit book a
   * huge credit, and a deposit into trip A's vault be submitted under trip B.
   *
   * Idempotent (S7): the row is claimed under the transaction's own signature,
   * which is unique, before anything is broadcast. Submitting the same signed
   * transaction twice, in parallel or later, yields one row and one credit.
   */
  async submitDeposit(
    tripId: number,
    userId: number,
    signedTx: string,
  ): Promise<string> {
    this.assertConfigured();
    const vault = await this.requireVault(tripId);
    if (vault.status !== VaultStatus.ACTIVE) {
      throw new BadRequestException('This trip’s group wallet is closed');
    }

    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new BadRequestException('Link a wallet before depositing');
    }
    const owner = new PublicKey(wallet.publicKey);

    const ix = decodeVaultInstruction(
      signedTx,
      this.solana.feePayer.publicKey,
      this.solana.program.programId,
      'deposit',
    );
    const expected: [string, PublicKey][] = [
      ['vault', new PublicKey(vault.vaultPda)],
      ['vault_ata', new PublicKey(vault.usdcAta)],
      ['usdc_mint', this.solana.usdcMint],
      ['treasury_ata', this.solana.treasuryAta()],
      ['owner', owner],
      ['owner_ata', getAssociatedTokenAddressSync(this.solana.usdcMint, owner)],
      ['token_program', TOKEN_PROGRAM_ID],
    ];
    assertInstructionAccounts(ix, expected, 'Deposit');
    if (!ix.signers.some((signer) => signer.equals(owner))) {
      throw new BadRequestException('Deposit rejected: not signed by you');
    }
    const amountMicro = ix.amountMicro ?? 0n;
    if (amountMicro <= 0n) {
      throw new BadRequestException(
        'Deposit rejected: amount must be positive',
      );
    }

    // Credit the net after the 0.1% skim — that is what landed in the vault.
    const feeMicro = (amountMicro * 10n) / 10_000n;
    const netMicro = amountMicro - feeMicro;

    const signature = transactionSignature(signedTx);
    const rowId = await this.claimDeposit(
      vault.id,
      userId,
      signature,
      netMicro,
    );
    if (rowId === null) {
      // Already booked by an earlier submit of this exact transaction.
      return signature;
    }

    await this.solana.broadcastSigned(signedTx);
    await this.solana.confirmSigned(signedTx, signature);
    // Only the submit that moves PENDING -> CONFIRMED announces the deposit.
    const confirmed = await this.prisma.vaultTransaction.updateMany({
      where: { id: rowId, status: VaultTxStatus.PENDING },
      data: { status: VaultTxStatus.CONFIRMED },
    });

    this.invalidateBalance(tripId);
    if (confirmed.count > 0) {
      // Nothing announced a deposit before, so every other member's screen sat
      // on a stale balance and an incomplete history until they left and came
      // back.
      const actor = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      this.trips.sendVaultBalanceChanged(tripId, {
        kind: VaultTxKind.DEPOSIT,
        actorUserId: userId,
        actorName: actor?.displayName ?? '',
        amountMicro: amountMicro.toString(),
      });
      this.logger.log(`deposit ${signature} confirmed for trip ${tripId}`);
    }
    return signature;
  }

  /**
   * Creates the PENDING deposit row under `signature`, or finds the one an
   * earlier submit created. Returns the row id still to be broadcast and
   * confirmed, or null when the deposit is already settled / owned by someone
   * else's row (nothing left to do).
   */
  private async claimDeposit(
    vaultId: number,
    userId: number,
    signature: string,
    netMicro: bigint,
  ): Promise<number | null> {
    try {
      const row = await this.prisma.vaultTransaction.create({
        data: {
          tripVaultId: vaultId,
          userId,
          kind: VaultTxKind.DEPOSIT,
          status: VaultTxStatus.PENDING,
          amountMicro: netMicro,
          signature,
        },
      });
      return row.id;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
    }
    const existing = await this.prisma.vaultTransaction.findFirst({
      where: { signature },
    });
    if (
      !existing ||
      existing.userId !== userId ||
      existing.tripVaultId !== vaultId ||
      existing.kind !== VaultTxKind.DEPOSIT
    ) {
      throw new ConflictException('This transaction was already submitted');
    }
    // A PENDING row means the earlier submit died before confirming; carry on
    // and finish it. A settled row means there is nothing to do.
    return existing.status === VaultTxStatus.PENDING ? existing.id : null;
  }

  /**
   * Throws when a trip still holds funds on chain. Called before trip deletion so
   * USDC cannot be stranded in a vault the app can no longer reach.
   */
  async assertDeletable(tripId: number): Promise<void> {
    await this.safety.assertTripDeletable(tripId);
  }
}
