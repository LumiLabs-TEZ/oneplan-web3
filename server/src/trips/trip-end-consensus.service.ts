import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAction,
  InviteStatus,
  TripEndRequestStatus,
  TripEndVoteDecision,
  TripStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TripsHandler } from '../realtime/handlers/trips.handler';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { TripVaultHistoryService } from '../trip-vault/trip-vault-history.service';
import { TripVaultSettlementService } from '../trip-vault/trip-vault-settlement.service';
import { TripVaultService } from '../trip-vault/trip-vault.service';
import {
  TripEndRequestDto,
  TripEndReviewDto,
  TripEndVoteMemberDto,
} from './dto/trip-end-consensus.dto';

@Injectable()
export class TripEndConsensusService {
  private readonly logger = new Logger(TripEndConsensusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsHandler: TripsHandler,
    private readonly activityService: TripActivityService,
    private readonly vaultService: TripVaultService,
    private readonly vaultHistory: TripVaultHistoryService,
    private readonly vaultSettlement: TripVaultSettlementService,
  ) {}

  async requestEnd(tripId: number, userId: number): Promise<TripEndRequestDto> {
    await this.assertCreator(tripId, userId);
    await this.assertAcceptedMember(tripId, userId);
    await this.requireVaultTrip(tripId);

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { status: true },
    });
    if (trip.status !== TripStatus.ONGOING) {
      throw new BadRequestException('Only an ongoing trip can request end');
    }

    const existing = await this.prisma.tripEndRequest.findUnique({
      where: { tripId },
    });
    if (existing?.status === TripEndRequestStatus.PENDING) {
      throw new ConflictException('An end request is already pending');
    }
    if (existing?.status === TripEndRequestStatus.APPROVED) {
      throw new BadRequestException(
        'This trip has already been approved to end',
      );
    }

    if (existing) {
      await this.prisma.$transaction([
        this.prisma.tripEndVote.deleteMany({
          where: { requestId: existing.id },
        }),
        this.prisma.tripEndRequest.update({
          where: { id: existing.id },
          data: {
            requestedBy: userId,
            status: TripEndRequestStatus.PENDING,
            resolvedAt: null,
            createdAt: new Date(),
          },
        }),
      ]);
    } else {
      await this.prisma.tripEndRequest.create({
        data: {
          tripId,
          requestedBy: userId,
          status: TripEndRequestStatus.PENDING,
        },
      });
    }

    const dto = await this.getRequest(tripId, userId);
    this.tripsHandler.sendTripEndRequestUpdated(tripId, {
      status: dto.status,
      approvedCount: dto.approvedCount,
      memberCount: dto.memberCount,
    });
    return dto;
  }

  async getRequest(tripId: number, userId: number): Promise<TripEndRequestDto> {
    await this.assertAcceptedMember(tripId, userId);
    const request = await this.prisma.tripEndRequest.findUnique({
      where: { tripId },
      include: {
        votes: true,
      },
    });
    if (!request) {
      throw new NotFoundException('No end request for this trip');
    }
    return this.toRequestDto(tripId, userId, request);
  }

  async getReview(tripId: number, userId: number): Promise<TripEndReviewDto> {
    const request = await this.getRequest(tripId, userId);
    const preview = await this.vaultSettlement.preview(tripId, userId);
    const history = await this.vaultHistory.getHistory(tripId, userId);
    return {
      request,
      history,
      mySettlement: preview.cashDebts.filter(
        (debt) => debt.fromUserId === userId || debt.toUserId === userId,
      ),
      balanceMicro: preview.balanceMicro,
    };
  }

  async castVote(
    tripId: number,
    userId: number,
    decision: TripEndVoteDecision,
  ): Promise<TripEndRequestDto> {
    await this.assertAcceptedMember(tripId, userId);
    await this.requireVaultTrip(tripId);

    const request = await this.prisma.tripEndRequest.findUnique({
      where: { tripId },
      include: { votes: true },
    });
    if (!request || request.status !== TripEndRequestStatus.PENDING) {
      throw new BadRequestException(
        'There is no pending end request to vote on',
      );
    }

    const existingVote = request.votes.find((vote) => vote.userId === userId);
    if (existingVote) {
      throw new ConflictException('You have already voted on this end request');
    }

    if (decision === TripEndVoteDecision.DENIED) {
      await this.prisma.$transaction([
        this.prisma.tripEndVote.create({
          data: {
            requestId: request.id,
            userId,
            decision: TripEndVoteDecision.DENIED,
          },
        }),
        this.prisma.tripEndRequest.update({
          where: { id: request.id },
          data: {
            status: TripEndRequestStatus.DENIED,
            resolvedAt: new Date(),
          },
        }),
      ]);

      const denied = await this.getRequest(tripId, userId);
      this.tripsHandler.sendTripEndRequestUpdated(tripId, {
        status: denied.status,
        approvedCount: denied.approvedCount,
        memberCount: denied.memberCount,
        deniedByUserId: userId,
      });
      return denied;
    }

    await this.prisma.tripEndVote.create({
      data: {
        requestId: request.id,
        userId,
        decision: TripEndVoteDecision.APPROVED,
      },
    });

    const members = await this.acceptedMembers(tripId);
    const votes = await this.prisma.tripEndVote.findMany({
      where: { requestId: request.id },
    });
    const approvedIds = new Set(
      votes
        .filter((vote) => vote.decision === TripEndVoteDecision.APPROVED)
        .map((vote) => vote.userId),
    );
    const allApproved = members.every((member) =>
      approvedIds.has(member.userId),
    );

    if (!allApproved) {
      const pending = await this.getRequest(tripId, userId);
      this.tripsHandler.sendTripEndRequestUpdated(tripId, {
        status: pending.status,
        approvedCount: pending.approvedCount,
        memberCount: pending.memberCount,
      });
      return pending;
    }

    await this.completeApproved(tripId, request.id, userId);
    return this.getRequest(tripId, userId);
  }

  private async completeApproved(
    tripId: number,
    requestId: number,
    actorUserId: number,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { name: true, status: true },
    });
    if (trip.status === TripStatus.ENDED) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.tripEndRequest.update({
        where: { id: requestId },
        data: {
          status: TripEndRequestStatus.APPROVED,
          resolvedAt: new Date(),
        },
      }),
      this.prisma.trip.update({
        where: { id: tripId },
        data: { status: TripStatus.ENDED },
      }),
    ]);

    this.activityService.log(
      tripId,
      actorUserId,
      ActivityAction.TRIP_ENDED,
      undefined,
      { name: trip.name },
    );

    // Settle before notifying clients. tripEnded used to fire first, so devices
    // opened TripEnd on a still-open vault (stale balance / no SETTLEMENT row)
    // and only a remount showed the final ledger.
    try {
      await this.vaultSettlement.executeFromServer(tripId);
    } catch (error) {
      // Trip is already ENDED; settlement can be retried by ops. Do not roll
      // the consensus back — members already approved the ledger.
      this.logger.error(
        `end consensus approved but vault settle failed for trip ${tripId}: ${error}`,
      );
    }

    this.tripsHandler.sendTripEnded(tripId);

    const approved = await this.prisma.tripEndRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { votes: true },
    });
    const members = await this.acceptedMembers(tripId);
    this.tripsHandler.sendTripEndRequestUpdated(tripId, {
      status: TripEndRequestStatus.APPROVED,
      approvedCount: members.length,
      memberCount: members.length,
    });
    void approved;
  }

  private async toRequestDto(
    tripId: number,
    userId: number,
    request: {
      id: number;
      tripId: number;
      requestedBy: number;
      status: TripEndRequestStatus;
      createdAt: Date;
      resolvedAt: Date | null;
      votes: { userId: number; decision: TripEndVoteDecision }[];
    },
  ): Promise<TripEndRequestDto> {
    const members = await this.acceptedMembers(tripId);
    const voteByUser = new Map(
      request.votes.map((vote) => [vote.userId, vote.decision]),
    );
    const memberDtos: TripEndVoteMemberDto[] = members.map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl,
      decision: voteByUser.get(member.userId) ?? null,
    }));
    const approvedCount = memberDtos.filter(
      (member) => member.decision === TripEndVoteDecision.APPROVED,
    ).length;

    return {
      id: request.id,
      tripId: request.tripId,
      requestedBy: request.requestedBy,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
      myDecision: voteByUser.get(userId) ?? null,
      approvedCount,
      memberCount: members.length,
      members: memberDtos,
    };
  }

  private async acceptedMembers(tripId: number): Promise<
    {
      userId: number;
      displayName: string;
      avatarUrl: string | null;
    }[]
  > {
    const rows = await this.prisma.tripMember.findMany({
      where: { tripId, inviteStatus: InviteStatus.ACCEPTED },
      select: {
        userId: true,
        user: { select: { displayName: true, avatarUrl: true } },
      },
      orderBy: { userId: 'asc' },
    });
    return rows.map((row) => ({
      userId: row.userId,
      displayName: row.user.displayName ?? '',
      avatarUrl: row.user.avatarUrl,
    }));
  }

  private async requireVaultTrip(tripId: number): Promise<void> {
    try {
      await this.vaultService.requireVault(tripId);
    } catch {
      throw new BadRequestException(
        'End-trip consensus is only available for vault trips',
      );
    }
  }

  private async assertAcceptedMember(
    tripId: number,
    userId: number,
  ): Promise<void> {
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!member || member.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You are not a member of this trip');
    }
  }

  private async assertCreator(tripId: number, userId: number): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { createdById: true },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
    if (trip.createdById !== userId) {
      throw new ForbiddenException('Only the trip creator can request to end');
    }
  }
}
