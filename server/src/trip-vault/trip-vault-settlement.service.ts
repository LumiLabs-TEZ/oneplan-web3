import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  InviteStatus,
  VaultStatus,
  VaultTxKind,
  VaultTxSource,
  VaultTxStatus,
} from '@prisma/client';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { PrismaService } from '../prisma/prisma.service';
import { SolanaService } from '../solana/solana.service';
import { TripsHandler } from '../realtime/handlers/trips.handler';
import { TripVaultService } from './trip-vault.service';
import {
  cashDebts,
  cashDebtLines,
  computeSettlement,
  SettlementShare,
} from './settlement-math';
import { SettlementPreviewDto } from './dto/settlement.dto';

/** Mirrors MAX_PAYOUTS / MAX_MEMBERS in the program. */
const MAX_PAYOUTS = 12;

/**
 * Winds up a trip vault after end-trip consensus: computes who is owed what,
 * then server-signs `execute_settlement` to pay out and close.
 */
@Injectable()
export class TripVaultSettlementService {
  private readonly logger = new Logger(TripVaultSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly solana: SolanaService,
    private readonly vaultService: TripVaultService,
    private readonly trips: TripsHandler,
  ) {}

  /**
   * Gathers the ledger and runs the split.
   *
   * A personal spend — a member paying a merchant from their own wallet on the
   * group's behalf — counts as if that member had deposited the amount and the
   * group had spent it, so the others owe them their share. `vaultOnly` drops
   * those rows: the leave flow pays out real vault money only, and a member who
   * fronted a dinner should neither be blocked from leaving nor paid back out of
   * other people's deposits.
   */
  private async shares(
    tripId: number,
    opts: { vaultOnly?: boolean } = {},
  ): Promise<{
    shares: SettlementShare[];
    balanceMicro: bigint;
    walletsByUser: Map<number, string>;
    membersById: Map<number, { displayName: string; avatarUrl: string | null }>;
    memberIds: number[];
    spends: {
      amountMicro: bigint;
      shareWithUserIds: number[];
      title: string | null;
    }[];
  }> {
    const vault = await this.vaultService.requireVault(tripId);
    const { balanceMicro } = await this.vaultService.getBalance(tripId);

    const members = await this.prisma.tripMember.findMany({
      where: { tripId, inviteStatus: InviteStatus.ACCEPTED },
      select: {
        userId: true,
        user: { select: { displayName: true, avatarUrl: true } },
      },
    });
    const memberIds = members.map((member) => member.userId);

    const rows = await this.prisma.vaultTransaction.findMany({
      where: { tripVaultId: vault.id, status: VaultTxStatus.CONFIRMED },
      select: {
        kind: true,
        source: true,
        userId: true,
        amountMicro: true,
        shareWithUserIds: true,
        expenseName: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const depositsByUser = new Map<number, bigint>();
    const spends: {
      amountMicro: bigint;
      shareWithUserIds: number[];
      title: string | null;
    }[] = [];
    for (const row of rows) {
      if (row.kind === VaultTxKind.DEPOSIT && row.userId !== null) {
        depositsByUser.set(
          row.userId,
          (depositsByUser.get(row.userId) ?? 0n) + row.amountMicro,
        );
      } else if (row.kind === VaultTxKind.SETTLEMENT && row.userId !== null) {
        // Leave (or end-trip) payout already sent — reduce that member's claim.
        depositsByUser.set(
          row.userId,
          (depositsByUser.get(row.userId) ?? 0n) - row.amountMicro,
        );
      } else if (row.kind === VaultTxKind.SPEND) {
        if (row.source === VaultTxSource.PERSONAL) {
          if (opts.vaultOnly || row.userId === null) {
            continue;
          }
          // Fronted by the member: credited like a deposit, shared like a
          // spend. The two cancel in the total, so sum(net) still equals the
          // vault balance.
          depositsByUser.set(
            row.userId,
            (depositsByUser.get(row.userId) ?? 0n) + row.amountMicro,
          );
        }
        spends.push({
          amountMicro: row.amountMicro,
          shareWithUserIds: row.shareWithUserIds,
          title: row.expenseName,
        });
      }
    }

    const wallets = await this.prisma.walletAccount.findMany({
      where: { userId: { in: memberIds } },
      select: { userId: true, publicKey: true },
    });

    return {
      shares: computeSettlement({
        memberIds,
        depositsByUser,
        spends,
        balanceMicro,
      }),
      balanceMicro,
      walletsByUser: new Map(wallets.map((w) => [w.userId, w.publicKey])),
      membersById: new Map(
        members.map((m) => [
          m.userId,
          {
            displayName: m.user.displayName ?? '',
            avatarUrl: m.user.avatarUrl,
          },
        ]),
      ),
      memberIds,
      spends,
    };
  }

  /**
   * Payouts that can actually go on chain: a positive amount, and a wallet to
   * send it to.
   *
   * A member owed money who never linked a wallet is not an error. Their share
   * stays off chain, exactly like the shortfall a non-depositor creates.
   */
  private payable(
    shares: SettlementShare[],
    walletsByUser: Map<number, string>,
  ): { userId: number; wallet: string; amountMicro: bigint }[] {
    return shares
      .filter(
        (share) => share.onChainMicro > 0n && walletsByUser.has(share.userId),
      )
      .map((share) => ({
        userId: share.userId,
        wallet: walletsByUser.get(share.userId)!,
        amountMicro: share.onChainMicro,
      }));
  }

  /**
   * Current vault ledger net for one accepted member (deposit − spend share).
   * Null when the trip has no vault.
   */
  async memberNetMicro(tripId: number, userId: number): Promise<bigint | null> {
    const vault = await this.prisma.tripVault.findUnique({
      where: { tripId },
      select: { id: true },
    });
    if (!vault) {
      return null;
    }
    const { shares } = await this.shares(tripId, { vaultOnly: true });
    return shares.find((share) => share.userId === userId)?.netMicro ?? 0n;
  }

  /**
   * Confirmed vault deposits attributed to this user (micro-USDC).
   */
  async memberDepositMicro(tripId: number, userId: number): Promise<bigint> {
    const vault = await this.prisma.tripVault.findUnique({
      where: { tripId },
      select: { id: true },
    });
    if (!vault) {
      return 0n;
    }
    const rows = await this.prisma.vaultTransaction.findMany({
      where: {
        tripVaultId: vault.id,
        userId,
        kind: VaultTxKind.DEPOSIT,
        status: VaultTxStatus.CONFIRMED,
      },
      select: { amountMicro: true },
    });
    return rows.reduce((sum, row) => sum + row.amountMicro, 0n);
  }

  async preview(
    tripId: number,
    callerUserId: number,
  ): Promise<SettlementPreviewDto> {
    const vaultRow = await this.vaultService.requireVault(tripId);
    const isSettled = vaultRow.status === VaultStatus.CLOSED;
    const {
      shares: forecast,
      balanceMicro,
      walletsByUser,
      membersById,
      memberIds,
      spends,
    } = await this.shares(tripId);

    // Once the vault has distributed there is nothing left to divide, so
    // recomputing the split reads a balance of zero and calls every net
    // position an unpaid cash debt — asking a member to hand over the part they
    // had already been sent on chain. What was actually paid is recorded, so
    // after settling that record is the answer rather than a fresh division.
    const shares = isSettled
      ? await this.settledShares(vaultRow.id, forecast)
      : forecast;
    const payable = this.payable(shares, walletsByUser);

    let blockedReason: string | null = null;
    if (payable.length === 0) {
      blockedReason =
        balanceMicro === 0n
          ? 'The group wallet is empty'
          : 'Nobody who is owed money has linked a wallet yet';
    } else if (payable.length > MAX_PAYOUTS) {
      blockedReason = `Settlement supports at most ${MAX_PAYOUTS} recipients`;
    }

    return {
      balanceMicro: balanceMicro.toString(),
      totalOnChainMicro: payable
        .reduce((sum, p) => sum + p.amountMicro, 0n)
        .toString(),
      totalOffChainMicro: shares
        .reduce((sum, s) => sum + s.offChainMicro, 0n)
        .toString(),
      payouts: shares.map((share) => ({
        userId: share.userId,
        displayName: membersById.get(share.userId)?.displayName ?? '',
        avatarUrl: membersById.get(share.userId)?.avatarUrl ?? null,
        walletAddress: walletsByUser.get(share.userId) ?? null,
        netMicro: share.netMicro.toString(),
        // A member owed money with no wallet shows nothing on chain and the
        // whole amount off chain, which is what will actually happen.
        onChainMicro: walletsByUser.has(share.userId)
          ? share.onChainMicro.toString()
          : '0',
        offChainMicro: walletsByUser.has(share.userId)
          ? share.offChainMicro.toString()
          : (share.netMicro > 0n ? share.netMicro : 0n).toString(),
      })),
      canSettle: blockedReason === null,
      blockedReason,
      isSettled,
      cashDebts: await this.debtsWithStatus(
        tripId,
        shares,
        membersById,
        callerUserId,
        memberIds,
        spends,
        walletsByUser,
      ),
    };
  }

  /**
   * The split as it actually happened, for a vault that has already settled.
   *
   * The net positions still come from the ledger — they do not change once
   * spending stops. What changes is how much of each was covered on chain, and
   * that is a fact now, not a division.
   */
  private async settledShares(
    tripVaultId: number,
    forecast: SettlementShare[],
  ): Promise<SettlementShare[]> {
    const paid = await this.prisma.vaultTransaction.findMany({
      where: {
        tripVaultId,
        kind: VaultTxKind.SETTLEMENT,
        status: VaultTxStatus.CONFIRMED,
      },
      select: { userId: true, amountMicro: true },
    });
    const paidByUser = new Map<number, bigint>();
    for (const row of paid) {
      if (row.userId !== null) {
        paidByUser.set(
          row.userId,
          (paidByUser.get(row.userId) ?? 0n) + row.amountMicro,
        );
      }
    }

    return forecast.map((share) => {
      const onChainMicro = paidByUser.get(share.userId) ?? 0n;
      return {
        ...share,
        onChainMicro,
        // Whatever the settlement did not cover is still owed in cash. A member
        // who owes rather than is owed has nothing on chain either way.
        offChainMicro: share.netMicro > 0n ? share.netMicro - onChainMicro : 0n,
      };
    });
  }

  /**
   * Pairs the derived debts with whichever have already been confirmed.
   */
  private async debtsWithStatus(
    tripId: number,
    shares: SettlementShare[],
    membersById: Map<number, { displayName: string; avatarUrl: string | null }>,
    callerUserId: number,
    memberIds: number[],
    spends: {
      amountMicro: bigint;
      shareWithUserIds: number[];
      title: string | null;
    }[],
    walletsByUser: Map<number, string>,
  ) {
    const vault = await this.vaultService.requireVault(tripId);
    const confirmed = await this.prisma.vaultCashSettlement.findMany({
      where: { tripVaultId: vault.id },
      select: { fromUserId: true, toUserId: true },
    });
    const confirmedKeys = new Set(
      confirmed.map((row) => `${row.fromUserId}:${row.toUserId}`),
    );

    return cashDebts(shares).map((debt) => ({
      fromUserId: debt.fromUserId,
      fromDisplayName: membersById.get(debt.fromUserId)?.displayName ?? '',
      toUserId: debt.toUserId,
      toDisplayName: membersById.get(debt.toUserId)?.displayName ?? '',
      amountMicro: debt.amountMicro.toString(),
      isConfirmed: confirmedKeys.has(`${debt.fromUserId}:${debt.toUserId}`),
      // Only the creditor. The server enforces this again on confirm; this
      // flag just keeps the button from appearing where it would be refused.
      canConfirm: debt.toUserId === callerUserId,
      lines: cashDebtLines(debt, spends, memberIds).map((line) => ({
        title: line.title,
        amountMicro: line.amountMicro.toString(),
      })),
      toWalletAddress: walletsByUser.get(debt.toUserId) ?? null,
    }));
  }

  /**
   * Server-authority settlement after off-chain end-trip consensus.
   *
   * Pays every on-chain share and closes the vault in one instruction. Members
   * do not co-sign — their Approve votes on the end request are the review.
   */
  async executeFromServer(
    tripId: number,
  ): Promise<{ settled: boolean; signature: string | null }> {
    const vault = await this.vaultService.requireVault(tripId);
    if (vault.status === VaultStatus.CLOSED) {
      return { settled: true, signature: null };
    }

    const { shares, walletsByUser, balanceMicro } = await this.shares(tripId);
    const payable = this.payable(shares, walletsByUser);

    if (payable.length === 0) {
      if (balanceMicro > 0n) {
        throw new BadRequestException(
          'Nobody who is owed money has linked a wallet yet',
        );
      }
      await this.vaultService.markClosed(tripId);
      // Empty vault close still moves UI (balance chip / history) that only
      // listens to balanceChanged — keep both events in sync with payout settle.
      this.trips.sendVaultBalanceChanged(tripId, {
        kind: VaultTxKind.SETTLEMENT,
        actorUserId: null,
        actorName: '',
        amountMicro: '0',
      });
      this.trips.sendVaultSettlementUpdated(tripId, {
        isSettled: true,
      });
      return { settled: true, signature: null };
    }
    if (payable.length > MAX_PAYOUTS) {
      throw new BadRequestException(
        `Settlement supports at most ${MAX_PAYOUTS} recipients`,
      );
    }

    const vaultPda = new PublicKey(vault.vaultPda);
    await this.ensureRecipientAccounts(payable.map((p) => p.wallet));

    const remaining = payable.map((p) => ({
      pubkey: getAssociatedTokenAddressSync(
        this.solana.usdcMint,
        new PublicKey(p.wallet),
      ),
      isWritable: true,
      isSigner: false,
    }));

    const ix = await this.solana.program.methods
      .executeSettlement(
        payable.map((p) => ({
          member: new PublicKey(p.wallet),
          amount: new BN(p.amountMicro.toString()),
        })),
      )
      .accountsPartial({
        vault: vaultPda,
        server: this.solana.feePayer.publicKey,
        usdcMint: this.solana.usdcMint,
      })
      .remainingAccounts(remaining)
      .instruction();

    const signature = await this.solana.sendAsFeePayer([ix]);

    await this.prisma.vaultTransaction.createMany({
      data: payable.map((p) => ({
        tripVaultId: vault.id,
        userId: p.userId,
        kind: VaultTxKind.SETTLEMENT,
        status: VaultTxStatus.CONFIRMED,
        amountMicro: p.amountMicro,
        signature,
      })),
    });
    await this.vaultService.markClosed(tripId);
    try {
      const closeSig = await this.solana.closeVault(vaultPda);
      this.logger.log(`vault accounts closed for trip ${tripId}: ${closeSig}`);
    } catch (error) {
      this.logger.warn(
        `executeSettlement ok but close_vault failed for trip ${tripId}: ${error}`,
      );
    }

    const totalPaid = payable.reduce((sum, p) => sum + p.amountMicro, 0n);
    this.trips.sendVaultBalanceChanged(tripId, {
      kind: VaultTxKind.SETTLEMENT,
      actorUserId: null,
      actorName: '',
      amountMicro: totalPaid.toString(),
    });
    this.trips.sendVaultSettlementUpdated(tripId, {
      isSettled: true,
    });
    this.logger.log(
      `server settlement executed for trip ${tripId}: ${payable.length} payout(s), ${signature}`,
    );
    return { settled: true, signature };
  }

  /**
   * Mid-trip leave: pay one member their positive net from the vault ATA.
   * Keeps the vault Active (does not close). Fails if wallet missing or
   * balance cannot cover the amount — caller must not remove the member.
   */
  async payoutLeaveMember(
    tripId: number,
    userId: number,
  ): Promise<{ signature: string; amountMicro: bigint }> {
    const vault = await this.vaultService.requireVault(tripId);
    if (vault.status === VaultStatus.CLOSED) {
      throw new BadRequestException('Group wallet is already closed');
    }

    const net = await this.memberNetMicro(tripId, userId);
    if (net === null || net <= 0n) {
      throw new BadRequestException('Member is not owed a vault payout');
    }

    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
      select: { publicKey: true },
    });
    if (!wallet?.publicKey) {
      throw new BadRequestException(
        'Member has not linked a OnePlan wallet for payout',
      );
    }

    const { balanceMicro } = await this.vaultService.getBalance(tripId);
    if (net > balanceMicro) {
      throw new BadRequestException(
        'Group wallet balance is too low to pay this leave settlement',
      );
    }

    const amountMicro = net;
    const memberPk = new PublicKey(wallet.publicKey);
    await this.ensureRecipientAccounts([wallet.publicKey]);

    const vaultPda = new PublicKey(vault.vaultPda);
    const memberAta = getAssociatedTokenAddressSync(
      this.solana.usdcMint,
      memberPk,
    );

    const ix = await this.solana.program.methods
      .payoutLeave(new BN(amountMicro.toString()))
      .accountsPartial({
        vault: vaultPda,
        server: this.solana.feePayer.publicKey,
        member: memberPk,
        memberAta,
        usdcMint: this.solana.usdcMint,
      })
      .instruction();

    const signature = await this.solana.sendAsFeePayer([ix]);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });

    await this.prisma.vaultTransaction.create({
      data: {
        tripVaultId: vault.id,
        userId,
        kind: VaultTxKind.SETTLEMENT,
        status: VaultTxStatus.CONFIRMED,
        amountMicro,
        signature,
        expenseName: 'Leave settlement',
      },
    });

    this.trips.sendVaultBalanceChanged(tripId, {
      kind: VaultTxKind.SETTLEMENT,
      actorUserId: userId,
      actorName: user?.displayName ?? '',
      amountMicro: amountMicro.toString(),
    });

    this.logger.log(
      `leave payout trip=${tripId} user=${userId}: ${amountMicro} micro, ${signature}`,
    );
    return { signature, amountMicro };
  }

  private async ensureRecipientAccounts(wallets: string[]): Promise<void> {
    const missing = [];
    for (const wallet of wallets) {
      const owner = new PublicKey(wallet);
      const ata = getAssociatedTokenAddressSync(this.solana.usdcMint, owner);
      const info = await this.solana.connection.getAccountInfo(ata);
      if (!info) {
        missing.push(
          createAssociatedTokenAccountInstruction(
            this.solana.feePayer.publicKey,
            ata,
            owner,
            this.solana.usdcMint,
          ),
        );
      }
    }
    if (missing.length > 0) {
      await this.solana.sendAsFeePayer(missing);
    }
  }

  /**
   * Confirms that a cash debt has been handed over.
   *
   * Only the creditor may call this. A debtor able to clear their own debt by
   * asserting they paid would make the record worth nothing, which is why this
   * departs from the older settleAllShares, where the debtor marks their own
   * shares settled.
   *
   * The debt itself is derived from the ledger rather than stored, so the
   * amount is recomputed here and the client's view of it is never trusted.
   */
  async confirmCashDebt(
    tripId: number,
    fromUserId: number,
    callerUserId: number,
  ): Promise<void> {
    const { shares } = await this.shares(tripId);
    const debt = cashDebts(shares).find(
      (candidate) =>
        candidate.fromUserId === fromUserId &&
        candidate.toUserId === callerUserId,
    );

    const settled = await this.vaultService.requireVault(tripId);
    if (settled.status !== VaultStatus.CLOSED) {
      // Every net position still moves with the next payment until the vault
      // distributes, so a debt confirmed now is confirmed against a figure that
      // has not stopped changing.
      throw new BadRequestException(
        'Settle the group wallet before confirming cash',
      );
    }

    if (!debt) {
      // Either nobody owes the caller this, or the caller is not the creditor.
      // Both are refusals rather than a not-found: the caller is asking about a
      // debt that is not theirs to settle.
      throw new ForbiddenException(
        'Only the person owed the money can confirm it was received',
      );
    }

    const vault = await this.vaultService.requireVault(tripId);
    await this.prisma.vaultCashSettlement.upsert({
      where: {
        tripVaultId_fromUserId_toUserId: {
          tripVaultId: vault.id,
          fromUserId,
          toUserId: callerUserId,
        },
      },
      create: {
        tripVaultId: vault.id,
        fromUserId,
        toUserId: callerUserId,
        amountMicro: debt.amountMicro,
      },
      // Idempotent: confirming twice is a double tap, not a second payment.
      update: {},
    });

    this.logger.log(
      `cash debt confirmed for trip ${tripId}: ${fromUserId} paid ${callerUserId}`,
    );
    this.trips.sendVaultSettlementUpdated(tripId, {
      isSettled: true,
    });
  }
}
