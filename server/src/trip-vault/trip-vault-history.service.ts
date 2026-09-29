import { Injectable, NotFoundException } from '@nestjs/common';
import {
  InviteStatus,
  TripMemberRole,
  TripStatus,
  VaultStatus,
  VaultTxKind,
  VaultTxSource,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TripVaultService } from './trip-vault.service';
import { bankNameFor } from './vault-bank-names';
import { VAULT_FAILURE_CODES } from './vault-failure-codes';
import {
  VaultHistoryEntryDto,
  VaultHistoryMemberDto,
  VaultTransactionDetailDto,
} from './dto/vault-history.dto';

type MemberRow = {
  id: number;
  displayName: string | null;
  avatarUrl: string | null;
};

/**
 * Read side of the vault: what the history list and the receipt screen show.
 *
 * Kept apart from TripVaultPayService, which moves money. Nothing here writes,
 * so it can never be the reason a payment behaves differently.
 */
@Injectable()
export class TripVaultHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultService: TripVaultService,
  ) {}

  private toMember(
    row: MemberRow | null | undefined,
  ): VaultHistoryMemberDto | null {
    if (!row) {
      return null;
    }
    return {
      userId: row.id,
      displayName: row.displayName ?? '',
      avatarUrl: row.avatarUrl,
    };
  }

  /** Resolves the share list, which is stored as bare ids. */
  private async membersByIds(ids: number[]): Promise<VaultHistoryMemberDto[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, avatarUrl: true },
    });
    return rows.map((row) => this.toMember(row)!);
  }

  /**
   * Full trip ledger by default. Pass `forUserId` (trip-end review) to keep only
   * rows that person should see: own deposits, spends shared with them (or All),
   * and settlements paid to them.
   */
  async getHistory(
    tripId: number,
    forUserId?: number,
  ): Promise<VaultHistoryEntryDto[]> {
    const vault = await this.vaultService.requireVault(tripId);

    const rows = await this.prisma.vaultTransaction.findMany({
      where: { tripVaultId: vault.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        expense: { select: { paidById: true } },
      },
    });

    const acceptedCount = await this.prisma.tripMember.count({
      where: { tripId, inviteStatus: InviteStatus.ACCEPTED },
    });

    // A row with no signature never reached the chain: the client did not
    // sign, or has not yet. Showing it read as money spent, and counted in
    // the day's total. Once abandoned it stays out for the same reason.
    const reached = rows.filter(
      (row) =>
        row.signature !== null &&
        row.failureCode !== VAULT_FAILURE_CODES.abandoned,
    );

    const visibleRows =
      forUserId === undefined
        ? reached
        : reached.filter((row) =>
            this.isVisibleToUser(row, forUserId, acceptedCount),
          );

    // One query for every share list rather than one per row.
    const allShareIds = [
      ...new Set(visibleRows.flatMap((row) => row.shareWithUserIds)),
    ];
    const shareMembers = await this.membersByIds(allShareIds);
    const byId = new Map(shareMembers.map((member) => [member.userId, member]));

    const walletsByUserId = new Map(
      (
        await this.prisma.walletAccount.findMany({
          where: { userId: { in: visibleRows.map((row) => row.userId ?? 0) } },
          select: { userId: true, publicKey: true },
        })
      ).map((wallet) => [wallet.userId, wallet.publicKey]),
    );

    return visibleRows.map((row) => {
      const shareIds = this.collapseShareIds(
        row.shareWithUserIds,
        acceptedCount,
      );
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        // A proposal that has not executed is a different kind of pending from a
        // payout that has not answered: one still holds the money, the other has
        // already sent it.
        needsApproval:
          row.status === 'PENDING' && !!row.proposalPda && !row.approvedAt,
        // A settlement is the one kind that pays a member rather than a merchant,
        // so it is the one kind with somebody to name.
        recipient:
          row.kind === VaultTxKind.SETTLEMENT ? this.toMember(row.user) : null,
        amountMicro: row.amountMicro.toString(),
        amountVnd: row.amountVnd?.toString() ?? null,
        title: row.expenseName,
        category: row.expenseCategory,
        // Money out of the vault is paid by the group whoever pressed the
        // button, so a vault spend names nobody here and reports that person
        // as madeBy. A personal spend is the one case with a payer: the member
        // whose own wallet the money left, and whom the group now owes.
        paidBy:
          row.source === VaultTxSource.PERSONAL
            ? this.toMember(row.user)
            : null,
        shareWith: shareIds
          .map((id) => byId.get(id))
          .filter((member): member is VaultHistoryMemberDto => !!member),
        fromAddress:
          row.kind === VaultTxKind.DEPOSIT && row.userId
            ? (walletsByUserId.get(row.userId) ?? null)
            : null,
        signature: row.signature,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  /** Per-viewer visibility for trip-end review (not the full vault History tab). */
  private isVisibleToUser(
    row: {
      kind: VaultTxKind;
      source: VaultTxSource;
      userId: number | null;
      shareWithUserIds: number[];
    },
    userId: number,
    acceptedCount: number,
  ): boolean {
    if (row.kind === VaultTxKind.DEPOSIT) {
      return row.userId === userId;
    }
    if (row.kind === VaultTxKind.SETTLEMENT) {
      return row.userId === userId;
    }
    // The member who fronted a personal spend is owed for it, so they see it
    // whether or not they are in the split.
    if (row.source === VaultTxSource.PERSONAL && row.userId === userId) {
      return true;
    }
    // SPEND / REVERT: only All (empty share) or named in shareWith — not the
    // submitter alone. Editing All → Huy must hide the row from everyone else
    // on end-trip review, including the member who paid.
    const shareIds = this.collapseShareIds(row.shareWithUserIds, acceptedCount);
    return shareIds.length === 0 || shareIds.includes(userId);
  }

  /**
   * Collapses a share list covering the whole trip into the empty list, which is
   * how the vault says "everyone" elsewhere. Without it a one member trip reads
   * that member's name where it means All.
   */
  private collapseShareIds(
    shareWithUserIds: number[],
    acceptedCount: number,
  ): number[] {
    if (shareWithUserIds.length === 0) {
      return [];
    }
    return shareWithUserIds.length >= acceptedCount ? [] : shareWithUserIds;
  }

  private async collapseIfEveryone(
    tripId: number,
    shareWithUserIds: number[],
  ): Promise<number[]> {
    if (shareWithUserIds.length === 0) {
      return [];
    }
    const accepted = await this.prisma.tripMember.count({
      where: { tripId, inviteStatus: InviteStatus.ACCEPTED },
    });
    return this.collapseShareIds(shareWithUserIds, accepted);
  }

  async getTransactionDetail(
    tripId: number,
    vaultTransactionId: number,
    callerUserId: number,
  ): Promise<VaultTransactionDetailDto> {
    const record = await this.prisma.vaultTransaction.findUnique({
      where: { id: vaultTransactionId },
      include: {
        tripVault: { select: { tripId: true, status: true } },
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    // Scoped to the trip in the URL, like the write endpoints: an id alone must
    // not reach across trips.
    if (!record || record.tripVault.tripId !== tripId) {
      throw new NotFoundException('Vault transaction not found');
    }

    const needsApproval =
      record.status === 'PENDING' && !!record.proposalPda && !record.approvedAt;
    const approvers = needsApproval
      ? await this.vaultService.approverUserIds(tripId)
      : null;
    const isHost = await this.isTripHost(tripId, callerUserId);
    // On-chain: proposer or any HOST/CO_HOST (ROLE_APPROVER). Hosts can cancel
    // even when the trip has fewer than two named approvers.
    const canCancel =
      needsApproval && (record.userId === callerUserId || isHost);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { status: true },
    });
    // Mirrors updateSpendMetadata: only confirmed spends, open vault, live trip,
    // payer or host — so the Edit button never offers a 403.
    const canEdit =
      record.kind === VaultTxKind.SPEND &&
      record.status === 'CONFIRMED' &&
      record.tripVault.status !== VaultStatus.CLOSED &&
      trip?.status !== TripStatus.ENDED &&
      (record.userId === callerUserId || isHost);

    return {
      id: record.id,
      status: record.status,
      needsApproval,
      // Answered here rather than inferred in the app, which cannot see how many
      // approvers a trip has. A member offered a button the chain will refuse is
      // worse than no button.
      canApprove:
        needsApproval &&
        record.userId !== callerUserId &&
        (approvers === null || approvers.includes(callerUserId)),
      canCancel,
      canEdit,
      amountVnd: record.amountVnd?.toString() ?? '0',
      amountUsdcMicro: record.amountMicro.toString(),
      recipientName: record.recipientName ?? '',
      bankName: bankNameFor(record.bankBin),
      bankAccountNumber: record.bankAccount ?? '',
      feeMicro: record.feeMicro?.toString() ?? '0',
      rate: record.rate ?? '',
      name: record.expenseName,
      note: record.note,
      category: record.expenseCategory,
      // See above: the vault pays, unless the member paid from their own wallet.
      paidBy:
        record.source === VaultTxSource.PERSONAL
          ? this.toMember(record.user)
          : null,
      shareWith: await this.membersByIds(
        await this.collapseIfEveryone(tripId, record.shareWithUserIds),
      ),
      madeBy: this.toMember(record.user),
      qrPayload: record.qrPayload,
      signature: record.signature,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /** Trip HOST or CO_HOST — mirrors on-chain ROLE_APPROVER for cancel. */
  private async isTripHost(tripId: number, userId: number): Promise<boolean> {
    const member = await this.prisma.tripMember.findFirst({
      where: {
        tripId,
        userId,
        inviteStatus: InviteStatus.ACCEPTED,
        role: { in: [TripMemberRole.HOST, TripMemberRole.CO_HOST] },
      },
      select: { id: true },
    });
    return member != null;
  }
}
