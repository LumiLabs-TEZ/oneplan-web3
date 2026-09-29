import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAction,
  Currency,
  InviteStatus,
  Prisma,
  SubscriptionStatus,
  TripMemberRole,
  TripStatus,
  VaultTxKind,
  VaultTxStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { BudgetsService } from '../budgets/budgets.service';
import { mapIsoToCurrencyEnum } from '../common/currency/iso-to-enum';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import {
  buildCurrencyRateMap,
  migrateTripCurrency,
} from './currency-migration';
import { NotificationsService } from '../notifications/notifications.service';
import { PlanItemsService } from '../plan-items/plan-items.service';
import { TripsHandler } from '../realtime/handlers/trips.handler';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { VaultSafetyService } from '../solana/vault-safety.service';
import { TripVaultService } from '../trip-vault/trip-vault.service';
import { TripVaultSettlementService } from '../trip-vault/trip-vault-settlement.service';
import {
  floorVaultLeaveNet,
  isMeaningfulVaultCredit,
  isMeaningfulVaultDebt,
} from '../trip-vault/vault-leave-dust';
import { ANALYTICS_EVENTS } from '../analytics/constants/events';
import { MissionsService } from '../missions/missions.service';
import { effectiveSubscriptionStatus } from '../common/subscription-status.util';
import { CreateTripDto } from './dto/create-trip.dto';
import { InviteMembersDto } from './dto/invite-members.dto';
import { InvitePreviewDto } from './dto/invite-preview.dto';
import { PendingTripInviteDto } from './dto/pending-invite.dto';
import { RespondInviteDto } from './dto/respond-invite.dto';
import { TripDto, TripLocationDto } from './dto/trip.dto';
import { TripMemberDto } from './dto/trip-member.dto';
import { TripSummaryDto } from './dto/trip-summary.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import {
  convertDayNumbersToPlanDates,
  findOngoingConflictNames,
} from './trip-start.helpers';
import {
  LeavePreviewDto,
  LeavePreviewBudgetDto,
  LeaveLedgerLineDto,
  LeaveSettlementDto,
  LeaveSettlementExpenseDto,
  VaultLeaveClearResultDto,
  VaultLeaveRequestDto,
  VaultLeaveRequestListDto,
  VaultLeaveAnnounceResultDto,
  VaultLeaveConfirmResultDto,
} from './dto/leave-preview.dto';
import { TripVaultHistoryService } from '../trip-vault/trip-vault-history.service';
import { splitEvenly } from '../trip-vault/settlement-math';

const TRIP_DETAIL_INCLUDE = {
  members: {
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          friendCode: true,
          subscriptionStatus: true,
          subscriptionExpiresAt: true,
        },
      },
    },
  },
  city: { select: { id: true, name: true, latitude: true, longitude: true } },
  state: { select: { id: true, name: true } },
  country: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: TripActivityService,
    private readonly storageService: StorageService,
    private readonly budgetsService: BudgetsService,
    private readonly planItemsService: PlanItemsService,
    private readonly tripsHandler: TripsHandler,
    private readonly notificationsService: NotificationsService,
    private readonly analytics: AnalyticsService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly missions: MissionsService,
    private readonly tripVault: TripVaultService,
    private readonly vaultSettlement: TripVaultSettlementService,
    private readonly vaultHistory: TripVaultHistoryService,
    private readonly vaultSafety: VaultSafetyService,
  ) {}

  async createTrip(userId: number, dto: CreateTripDto): Promise<TripDto> {
    const inviteCode = randomBytes(32).toString('hex');

    // Get user's preferred currency if not specified in DTO
    let currency = dto.currency;
    if (!currency) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { preferredCurrency: true },
      });
      currency = user?.preferredCurrency ?? Currency.USD;
    }

    // Resolve local currencies: use explicit DTO value (including empty
    // array) when provided; otherwise auto-suggest from the trip country.
    let localCurrencies: Currency[];
    if (dto.localCurrencies !== undefined) {
      // Home currency is never a "local" currency — same rule as the
      // auto-suggest branch below and the updateTrip filter.
      localCurrencies = dto.localCurrencies.filter((c) => c !== currency);
    } else if (dto.countryId !== undefined) {
      const country = await this.prisma.country.findUnique({
        where: { id: dto.countryId },
        select: { currency: true },
      });
      const suggested = mapIsoToCurrencyEnum(country?.currency);
      localCurrencies =
        suggested !== null && suggested !== currency ? [suggested] : [];
    } else {
      localCurrencies = [];
    }

    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          name: dto.name,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          cityId: dto.cityId,
          stateId: dto.stateId,
          countryId: dto.countryId,
          currency,
          localCurrencies,
          createdById: userId,
          inviteCode,
        },
      });

      await tx.tripMember.create({
        data: {
          tripId: created.id,
          userId,
          inviteStatus: InviteStatus.ACCEPTED,
          joinedAt: new Date(),
          role: TripMemberRole.HOST,
        },
      });

      return created;
    });

    this.activityService.log(
      trip.id,
      userId,
      ActivityAction.TRIP_CREATED,
      undefined,
      {
        name: dto.name,
      },
    );

    // Lazy vault: created on Enable / first deposit, not on trip create.
    // A trip without a vault row simply shows the ordinary budget card.

    void this.analytics.track(ANALYTICS_EVENTS.TRIP_CREATED, {
      userId,
      properties: {
        tripId: trip.id,
        countryId: trip.countryId ?? null,
        cityId: trip.cityId ?? null,
        currency: trip.currency,
      },
    });
    void this.missions.onTripCreated(userId, trip.id, trip.startDate);

    return this.findTripDetail(trip.id, userId);
  }

  async listMyTrips(
    userId: number,
    status?: TripStatus,
  ): Promise<TripSummaryDto[]> {
    const trips = await this.prisma.trip.findMany({
      where: {
        members: { some: { userId, inviteStatus: InviteStatus.ACCEPTED } },
        ...(status ? { status } : {}),
      },
      include: {
        members: {
          where: { userId, inviteStatus: InviteStatus.ACCEPTED },
          select: { lastSeenChatMessageId: true },
        },
        city: {
          select: { id: true, name: true, latitude: true, longitude: true },
        },
        state: { select: { id: true, name: true } },
        country: { select: { id: true, name: true } },
        _count: {
          select: {
            members: { where: { inviteStatus: InviteStatus.ACCEPTED } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      trips.map(async (trip) => ({
        id: trip.id,
        name: trip.name,
        coverImageUrl: await this.resolveCoverImageUrl(trip.coverImageUrl),
        status: trip.status,
        startDate: trip.startDate?.toISOString() ?? null,
        endDate: trip.endDate?.toISOString() ?? null,
        memberCount: trip._count.members,
        lastSeenChatMessageId: trip.members[0]?.lastSeenChatMessageId ?? null,
        currency: trip.currency,
        location: this.formatLocation(trip.city, trip.state, trip.country),
      })),
    );
  }

  async getTrip(tripId: number, userId: number): Promise<TripDto> {
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: { inviteStatus: true, invitedById: true },
    });
    if (!member || member.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You are not a member of this trip');
    }
    // friend_joined mission: an invited member opening the trip is the
    // spec's "invite worked" signal — pays the inviter. Fire-and-forget with
    // its own cheap pre-checks; adds nothing to the response path.
    if (member.invitedById !== null && member.invitedById !== userId) {
      void this.missions.onInviteeEngaged(member.invitedById, userId);
    }
    return this.findTripDetail(tripId, userId);
  }

  async updateTrip(
    tripId: number,
    userId: number,
    dto: UpdateTripDto,
  ): Promise<TripDto> {
    await this.assertMember(tripId, userId);

    if (dto.status === TripStatus.ONGOING) {
      await this.assertCreator(tripId, userId);

      // Check ALL accepted members for ongoing trip conflicts
      const conflictingNames = await findOngoingConflictNames(
        this.prisma,
        tripId,
      );
      if (conflictingNames.length > 0) {
        throw new HttpException(
          {
            statusCode: 400,
            error: 'MEMBER_CONFLICT',
            memberNames: conflictingNames,
          },
          400,
        );
      }
    }

    const now = new Date();
    const currentTrip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: {
        startDate: true,
        endDate: true,
        currency: true,
        localCurrencies: true,
        status: true,
      },
    });

    // A trip with a group wallet ends only through the end-trip vote, which
    // also settles the vault. A plain status PATCH would strand the USDC.
    if (
      dto.status === TripStatus.ENDED &&
      currentTrip.status !== TripStatus.ENDED
    ) {
      await this.vaultSafety.assertEndableWithoutConsensus(tripId);
    }

    // Currency change: allowed any time except on an ended trip — settled
    // history must not be re-denominated. All money rows are migrated to the
    // new currency inside the update transaction below.
    const isCurrencyChange =
      dto.currency !== undefined && dto.currency !== currentTrip.currency;
    if (
      isCurrencyChange &&
      (currentTrip.status === TripStatus.ENDED ||
        dto.status === TripStatus.ENDED)
    ) {
      throw new BadRequestException('Cannot change currency on an ended trip');
    }
    // Home currency is never a "local" currency (same rule as createTrip).
    // Recompute whenever the home currency changes or an explicit list is
    // sent, so e.g. changing home to THB drops THB from localCurrencies.
    const nextHomeCurrency = dto.currency ?? currentTrip.currency;
    const nextLocalCurrencies =
      dto.localCurrencies !== undefined || isCurrencyChange
        ? (dto.localCurrencies ?? currentTrip.localCurrencies).filter(
            (c) => c !== nextHomeCurrency,
          )
        : undefined;
    const autoStartDate =
      dto.status === TripStatus.ONGOING &&
      !currentTrip?.startDate &&
      dto.startDate === undefined
        ? now
        : undefined;
    const autoEndDate = dto.status === TripStatus.ENDED ? now : undefined;

    const updateData = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(autoStartDate
        ? { startDate: autoStartDate }
        : dto.startDate !== undefined
          ? { startDate: new Date(dto.startDate) }
          : {}),
      ...(autoEndDate
        ? { endDate: autoEndDate }
        : dto.endDate !== undefined
          ? { endDate: new Date(dto.endDate) }
          : {}),
      ...(dto.cityId !== undefined ? { cityId: dto.cityId } : {}),
      ...(dto.stateId !== undefined ? { stateId: dto.stateId } : {}),
      ...(dto.countryId !== undefined ? { countryId: dto.countryId } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(nextLocalCurrencies !== undefined
        ? { localCurrencies: nextLocalCurrencies }
        : {}),
    };

    let updated;
    let migrationUsedStaleRates = false;
    if (isCurrencyChange) {
      // Rates are fetched before the transaction so external lookups never
      // extend it; the tx itself is pure math + row updates.
      const { map: rateFor, staleCurrencies } = await buildCurrencyRateMap(
        this.prisma,
        this.exchangeRatesService,
        tripId,
        currentTrip.currency,
        dto.currency!,
      );
      updated = await this.prisma.$transaction(async (tx) => {
        // Serialize concurrent currency changes per trip. Lock space is
        // shared with scan-credit's per-user locks (different id domain;
        // collision is harmless — it only serializes two unrelated txs).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${tripId}::bigint)`;
        const fresh = await tx.trip.findUniqueOrThrow({
          where: { id: tripId },
          select: { currency: true },
        });
        if (fresh.currency !== currentTrip.currency) {
          throw new ConflictException(
            'Trip currency was changed concurrently. Reload and retry.',
          );
        }
        // Update the trip first so concurrent readers inside later
        // statements see the new currency.
        const trip = await tx.trip.update({
          where: { id: tripId },
          data: updateData,
        });
        await migrateTripCurrency(tx, rateFor, tripId, currentTrip.currency);
        return trip;
      });
      // All amounts changed — nudge online members to refetch.
      this.tripsHandler.sendTripSettlementUpdated(tripId);
      if (staleCurrencies.length > 0) {
        migrationUsedStaleRates = true;
        this.logger.warn(
          `Trip ${tripId} currency migration to ${dto.currency} used stale/fallback rates for: ${staleCurrencies.join(', ')}`,
        );
      }
    } else {
      updated = await this.prisma.trip.update({
        where: { id: tripId },
        data: updateData,
      });
    }

    // Convert day numbers to real dates when trip starts
    if (dto.status === TripStatus.ONGOING) {
      await convertDayNumbersToPlanDates(
        this.prisma,
        tripId,
        updated.startDate ?? autoStartDate ?? now,
      );
      // Other members' open apps refresh (same event the auto-start cron emits).
      this.tripsHandler.sendTripStarted(tripId);
    }

    // Shift existing planDates when startDate changes on a trip that already
    // had a startDate (e.g. user edits the schedule after start). Each item's
    // planDate moves by the same delta so day-N stays day-N relative to the
    // new window.
    const previousStartDate = currentTrip?.startDate ?? null;
    const newStartDate = updated.startDate ?? null;
    if (
      dto.startDate !== undefined &&
      previousStartDate &&
      newStartDate &&
      previousStartDate.getTime() !== newStartDate.getTime()
    ) {
      const msPerDay = 24 * 60 * 60 * 1000;
      const deltaDays = Math.round(
        (newStartDate.getTime() - previousStartDate.getTime()) / msPerDay,
      );
      if (deltaDays !== 0) {
        const itemsWithPlanDate = await this.prisma.tripPlanItem.findMany({
          where: { tripId, planDate: { not: null } },
        });
        for (const item of itemsWithPlanDate) {
          const shifted = new Date(item.planDate!);
          shifted.setDate(shifted.getDate() + deltaDays);
          await this.prisma.tripPlanItem.update({
            where: { id: item.id },
            data: { planDate: shifted },
          });
        }
      }
    }

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.TRIP_UPDATED,
      undefined,
      {
        name: updated.name,
      },
    );

    // plan_ahead: trips are created without dates on iOS, so the ≥30-days
    // check re-runs whenever the schedule is set (deduped per trip).
    if (dto.startDate !== undefined && updated.startDate) {
      void this.missions.onTripScheduleSet(
        userId,
        tripId,
        updated.createdById,
        updated.startDate,
      );
    }

    if (dto.status === TripStatus.ENDED) {
      this.activityService.log(
        tripId,
        userId,
        ActivityAction.TRIP_ENDED,
        undefined,
        {
          name: updated.name,
        },
      );
      this.tripsHandler.sendTripEnded(tripId);
      // trip_settled re-checks its full predicate (ENDED + expenses all
      // settled) internally.
      void this.missions.onTripPossiblySettled(tripId);
    }

    const detail = await this.findTripDetail(tripId, userId);
    if (migrationUsedStaleRates) {
      // Same contract as ExpenseDto/BudgetDto.rateStale: only set on the
      // immediate response of the mutation that used a stale rate.
      detail.rateStale = true;
    }
    return detail;
  }

  async deleteTrip(tripId: number, userId: number): Promise<void> {
    await this.assertCreator(tripId, userId);
    // Checked before the realtime broadcast: a vault holding USDC blocks the
    // delete, and clients must not be told the trip is gone when it is not.
    await this.tripVault.assertDeletable(tripId);
    this.tripsHandler.sendTripDeleted(tripId);
    await this.prisma.trip.delete({ where: { id: tripId } });
  }

  async inviteMembers(
    tripId: number,
    userId: number,
    dto: InviteMembersDto,
  ): Promise<TripMemberDto[]> {
    await this.assertMember(tripId, userId);

    const [tripInfo, inviter] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          inviteCode: true,
          name: true,
          coverImageUrl: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      }),
    ]);

    if (!tripInfo) {
      throw new NotFoundException('Trip not found');
    }

    await this.prisma.tripMember.createMany({
      data: dto.userIds.map((uid) => ({
        tripId,
        userId: uid,
        inviteStatus: InviteStatus.PENDING,
        invitedById: userId,
      })),
      skipDuplicates: true,
    });

    const members = await this.prisma.tripMember.findMany({
      where: { tripId, userId: { in: dto.userIds } },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            friendCode: true,
            subscriptionStatus: true,
            subscriptionExpiresAt: true,
          },
        },
      },
    });

    for (const member of members) {
      this.activityService.log(
        tripId,
        userId,
        ActivityAction.MEMBER_INVITED,
        member.userId,
        { displayName: member.user.displayName },
      );
      void this.analytics.track(ANALYTICS_EVENTS.MEMBER_INVITED, {
        userId,
        properties: { tripId, invitedUserId: member.userId },
      });
    }
    // invite_2 counts distinct invitee accounts across all trips.
    void this.missions.onMemberInvited(userId);

    const pendingInvitees = await this.prisma.tripMember.findMany({
      where: {
        tripId,
        userId: { in: dto.userIds },
        inviteStatus: InviteStatus.PENDING,
      },
      select: { userId: true },
    });

    const coverImageUrl = await this.resolveCoverImageUrl(
      tripInfo.coverImageUrl,
    );

    if (tripInfo.inviteCode) {
      const invitePayload = {
        inviteCode: tripInfo.inviteCode,
        tripName: tripInfo.name,
        coverImageUrl,
        invitedByDisplayName: inviter?.displayName ?? 'Someone',
      };

      const onlineUserIds = this.tripsHandler.getOnlineUserIds(
        pendingInvitees.map((i) => i.userId),
      );

      for (const invitee of pendingInvitees) {
        this.tripsHandler.sendTripInvite(invitee.userId, invitePayload);
        void this.notificationsService.sendTripInvitePush(
          invitee.userId,
          invitePayload.invitedByDisplayName,
          invitePayload.tripName,
          invitePayload.inviteCode,
          onlineUserIds,
        );
      }
    }

    return Promise.all(members.map((m) => this.formatMember(m)));
  }

  async listPendingInvites(userId: number): Promise<PendingTripInviteDto[]> {
    const pending = await this.prisma.tripMember.findMany({
      where: {
        userId,
        inviteStatus: InviteStatus.PENDING,
      },
      include: {
        trip: {
          select: {
            inviteCode: true,
            name: true,
            coverImageUrl: true,
            createdBy: {
              select: { displayName: true },
            },
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    return Promise.all(
      pending
        .filter((row) => row.trip.inviteCode !== null)
        .map(async (row) => ({
          inviteCode: row.trip.inviteCode as string,
          tripName: row.trip.name,
          coverImageUrl: await this.resolveCoverImageUrl(
            row.trip.coverImageUrl,
          ),
          invitedByDisplayName: row.trip.createdBy.displayName,
        })),
    );
  }

  async joinTrip(inviteCode: string, userId: number): Promise<TripDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { inviteCode },
    });

    if (!trip) {
      throw new NotFoundException('Invalid invite code');
    }

    // Idempotent re-join: an already-ACCEPTED member re-scanning the QR /
    // re-opening the deep link just lands back in the trip. Checked up
    // front, before the ongoing-trip conflict check, so re-joining a trip
    // they're already in never trips that guard.
    const existingMember = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId: trip.id, userId } },
    });

    if (existingMember?.inviteStatus === InviteStatus.ACCEPTED) {
      return this.findTripDetail(trip.id, userId);
    }

    // Prevent joining an ongoing trip if user already has one
    if (trip.status === TripStatus.ONGOING) {
      const existingOngoingTrip = await this.prisma.trip.findFirst({
        where: {
          id: { not: trip.id },
          status: TripStatus.ONGOING,
          members: {
            some: {
              userId,
              inviteStatus: InviteStatus.ACCEPTED,
            },
          },
        },
        select: { name: true },
      });

      if (existingOngoingTrip) {
        throw new HttpException(
          {
            statusCode: 409,
            error: 'ONGOING_TRIP_CONFLICT',
            message: `You already have an ongoing trip: "${existingOngoingTrip.name}"`,
            existingTripName: existingOngoingTrip.name,
          },
          409,
        );
      }
    }

    await this.prisma.tripMember.upsert({
      where: { tripId_userId: { tripId: trip.id, userId } },
      create: {
        tripId: trip.id,
        userId,
        inviteStatus: InviteStatus.ACCEPTED,
        joinedAt: new Date(),
        // Share-link/QR joins never pass through inviteMembers, but they are
        // the primary invite flow — credit the code's owner so friend_joined
        // can pay. (An existing PENDING row keeps its original inviter via the
        // update branch below.) Deliberately NOT counted toward invite_2,
        // whose trigger is strictly MEMBER_INVITED.
        invitedById: trip.createdById !== userId ? trip.createdById : null,
      },
      update: {
        inviteStatus: InviteStatus.ACCEPTED,
        joinedAt: new Date(),
      },
    });

    await this.budgetsService.addPaymentsForMember(trip.id, userId);
    await this.planItemsService.addMemberToAllPlanItems(trip.id, userId);
    // A member who is not on chain cannot approve a spend or a settlement, so
    // a trip with a group wallet adds them as they join. Fire-and-forget and a
    // no-op without a vault / with web3 off: chain latency must not sit on the
    // join request, a hiccup must not stop someone joining, and syncMembers is
    // idempotent, so the next sync picks them up.
    void this.tripVault.syncMembersIfVault(trip.id).catch((error) => {
      this.logger.warn(
        `could not sync trip ${trip.id} members on chain: ${String(error)}`,
      );
    });

    const joiningUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    this.activityService.log(
      trip.id,
      userId,
      ActivityAction.MEMBER_JOINED,
      userId,
      {
        displayName: joiningUser?.displayName,
      },
    );

    this.notificationsService.sendMemberJoinedPush(
      trip.id,
      userId,
      joiningUser?.displayName ?? 'Someone',
    );

    return this.findTripDetail(trip.id, userId);
  }

  async getInvitePreview(
    inviteCode: string,
    userId?: number,
  ): Promise<InvitePreviewDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { inviteCode },
      select: {
        id: true,
        name: true,
        coverImageUrl: true,
        status: true,
        _count: {
          select: {
            members: { where: { inviteStatus: InviteStatus.ACCEPTED } },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException('Invalid invite code');
    }

    let isMember = false;
    if (userId !== undefined) {
      const member = await this.prisma.tripMember.findUnique({
        where: { tripId_userId: { tripId: trip.id, userId } },
        select: { inviteStatus: true },
      });
      isMember = member?.inviteStatus === InviteStatus.ACCEPTED;
    }

    return {
      tripId: trip.id,
      name: trip.name,
      coverImageUrl: await this.resolveCoverImageUrl(trip.coverImageUrl),
      memberCount: trip._count.members,
      status: trip.status,
      isMember,
    };
  }

  async respondToInvite(
    tripId: number,
    userId: number,
    dto: RespondInviteDto,
  ): Promise<TripMemberDto> {
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });

    if (!member) {
      throw new NotFoundException('No invitation found for this trip');
    }

    if (member.inviteStatus !== InviteStatus.PENDING) {
      throw new BadRequestException('Invitation has already been responded to');
    }

    const updated = await this.prisma.tripMember.update({
      where: { tripId_userId: { tripId, userId } },
      data: {
        inviteStatus: dto.status as InviteStatus,
        joinedAt: dto.status === InviteStatus.ACCEPTED ? new Date() : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            friendCode: true,
            subscriptionStatus: true,
            subscriptionExpiresAt: true,
          },
        },
      },
    });

    if (dto.status === InviteStatus.ACCEPTED) {
      await this.budgetsService.addPaymentsForMember(tripId, userId);
      await this.planItemsService.addMemberToAllPlanItems(tripId, userId);
      this.activityService.log(
        tripId,
        userId,
        ActivityAction.MEMBER_JOINED,
        userId,
        {
          displayName: updated.user.displayName,
        },
      );

      this.notificationsService.sendMemberJoinedPush(
        tripId,
        userId,
        updated.user.displayName,
      );
    }

    return await this.formatMember(updated);
  }

  async getLeavePreview(
    tripId: number,
    userId: number,
  ): Promise<LeavePreviewDto> {
    await this.assertMember(tripId, userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });

    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: {
        vaultLeaveClearedAt: true,
        vaultLeaveRequestedAt: true,
        vaultLeaveRequestNetMicro: true,
      },
    });
    const vaultLeaveCleared = member?.vaultLeaveClearedAt != null;
    const leaveRequestPending = member?.vaultLeaveRequestedAt != null;

    const netMicro = await this.vaultSettlement.memberNetMicro(tripId, userId);
    const hasVault = netMicro !== null;

    if (hasVault) {
      const net = netMicro;
      const floored = floorVaultLeaveNet(net);
      const owedMicro = floored < 0n ? -floored : 0n;
      // Sub-cent dust counts as settled — same gate as the iOS leave sheet.
      const canAnnounce = !isMeaningfulVaultDebt(net) && !leaveRequestPending;
      // Self-leave is host-confirmed for vault trips; legacy clear still allows
      // DELETE when debt was marked paid and net is not positive.
      let canLeave = false;
      let blockReason: string | null = null;
      if (leaveRequestPending) {
        blockReason = 'leave_pending';
      } else if (isMeaningfulVaultCredit(net)) {
        blockReason = 'group_owes_you';
      } else if (isMeaningfulVaultDebt(net) && !vaultLeaveCleared) {
        blockReason = 'owes_group';
      } else if (vaultLeaveCleared || floored === 0n) {
        canLeave = vaultLeaveCleared && floored <= 0n;
      }

      const acceptedMembers = await this.prisma.tripMember.findMany({
        where: { tripId, inviteStatus: InviteStatus.ACCEPTED },
        select: { userId: true },
      });
      const memberIds = acceptedMembers.map((m) => m.userId);

      const history = await this.vaultHistory.getHistory(tripId, userId);
      const lines: LeaveLedgerLineDto[] = history.map((row) => {
        const time = this.formatLeaveTime(row.createdAt);
        let subtitle: string | null = null;
        let signed: string;
        let amountVnd: string | null = null;

        if (
          row.kind === VaultTxKind.DEPOSIT ||
          row.kind === VaultTxKind.SETTLEMENT
        ) {
          signed = row.amountMicro;
          if (row.kind === VaultTxKind.DEPOSIT) {
            subtitle = row.fromAddress ?? null;
          }
        } else {
          // History amount is the full spend; leave sheet shows this member's share.
          const participants =
            row.shareWith && row.shareWith.length > 0
              ? row.shareWith.map((m) => m.userId)
              : memberIds;
          const share =
            splitEvenly(BigInt(row.amountMicro), participants).get(userId) ??
            0n;
          // A spend this member paid from their own wallet is money the group
          // owes them: what they fronted less their own share.
          const fronted = row.paidBy?.userId === userId;
          signed = fronted
            ? (BigInt(row.amountMicro) - share).toString()
            : `-${share.toString()}`;
          // Display share in VND (what the merchant was paid), not USDC×live FX.
          if (row.amountVnd) {
            const vndShare =
              splitEvenly(BigInt(row.amountVnd), participants).get(userId) ??
              0n;
            amountVnd = fronted
              ? (BigInt(row.amountVnd) - vndShare).toString()
              : `-${vndShare.toString()}`;
          }
          subtitle =
            !row.shareWith || row.shareWith.length === 0
              ? 'All'
              : row.shareWith.map((m) => m.displayName).join(', ');
        }

        return {
          title:
            row.title ??
            (row.kind === VaultTxKind.DEPOSIT
              ? 'Deposit USDC'
              : row.kind === VaultTxKind.SETTLEMENT
                ? 'Settlement'
                : 'Spend'),
          amountMicro: signed,
          amountVnd,
          kind: row.kind,
          time,
          subtitle,
          category: row.category ? String(row.category) : null,
        };
      });

      return {
        displayName: user?.displayName ?? 'Unknown',
        budgets: [],
        totalBudgetRefund: 0,
        totalBudgetCancelled: 0,
        totalExpenseShare: 0,
        netSettlement: 0,
        hasVault: true,
        netMicro: floored.toString(),
        owedMicro: owedMicro.toString(),
        lines,
        canAnnounce,
        leaveRequestPending,
        canLeave,
        blockReason,
        vaultLeaveCleared,
      };
    }

    // Get user's budget contributions
    const budgetPayments = await this.prisma.budgetPayment.findMany({
      where: {
        budget: { tripId },
        userId,
      },
      include: {
        budget: { select: { name: true } },
      },
    });

    const budgets: LeavePreviewBudgetDto[] = budgetPayments.map((bp) => ({
      budgetName: bp.budget.name,
      amount: Number(bp.amount),
      isPaid: bp.isPaid,
      refundAmount: bp.isPaid ? Number(bp.amount) : 0,
    }));

    const totalBudgetRefund = budgets
      .filter((b) => b.isPaid)
      .reduce((sum, b) => sum + b.refundAmount, 0);

    const totalBudgetCancelled = budgets
      .filter((b) => !b.isPaid)
      .reduce((sum, b) => sum + b.amount, 0);

    // Get user's expense shares
    const userExpenseShares = await this.prisma.expenseShare.findMany({
      where: {
        expense: { tripId },
        userId,
      },
    });

    const totalExpenseShare = userExpenseShares.reduce(
      (sum, s) => sum + Number(s.shareAmount),
      0,
    );

    const netSettlement = totalBudgetRefund - totalExpenseShare;

    return {
      displayName: user?.displayName ?? 'Unknown',
      budgets,
      totalBudgetRefund,
      totalBudgetCancelled,
      totalExpenseShare,
      netSettlement,
      hasVault: false,
      lines: [],
      canAnnounce: false,
      leaveRequestPending: false,
      canLeave: true,
      blockReason: null,
      vaultLeaveCleared: false,
    };
  }

  /**
   * Host confirms a member settled their vault debt off-chain so they may leave.
   */
  async clearVaultLeave(
    tripId: number,
    targetUserId: number,
    currentUserId: number,
  ): Promise<VaultLeaveClearResultDto> {
    await this.assertCreator(tripId, currentUserId);
    await this.assertMember(tripId, targetUserId);

    const net = await this.vaultSettlement.memberNetMicro(tripId, targetUserId);
    if (net === null) {
      throw new BadRequestException('This trip has no group vault');
    }
    if (net >= 0n) {
      throw new BadRequestException('This member does not owe the group');
    }
    if (targetUserId === currentUserId) {
      throw new BadRequestException('Host cannot mark their own leave cleared');
    }

    await this.prisma.tripMember.update({
      where: { tripId_userId: { tripId, userId: targetUserId } },
      data: { vaultLeaveClearedAt: new Date() },
    });

    return { cleared: true };
  }

  /**
   * Member announces leave after clearing debt (or when |net| < $0.01 dust).
   * Host must confirm; payout when credit ≥ $0.01 runs on confirm via payout_leave.
   */
  async announceVaultLeave(
    tripId: number,
    userId: number,
  ): Promise<VaultLeaveAnnounceResultDto> {
    await this.assertMember(tripId, userId);
    const net = await this.vaultSettlement.memberNetMicro(tripId, userId);
    if (net === null) {
      throw new BadRequestException('This trip has no group vault');
    }
    if (isMeaningfulVaultDebt(net)) {
      throw new BadRequestException(
        'Deposit the amount you owe before announcing leave',
      );
    }

    const member = await this.prisma.tripMember.findUniqueOrThrow({
      where: { tripId_userId: { tripId, userId } },
      select: {
        vaultLeaveRequestedAt: true,
        user: { select: { displayName: true, avatarUrl: true } },
      },
    });
    if (member.vaultLeaveRequestedAt) {
      throw new BadRequestException(
        'Leave already announced; wait for the host',
      );
    }

    // READY: last DEPOSIT in vault history. PAYOUT: live credit to send back.
    const snap = isMeaningfulVaultCredit(net)
      ? net
      : await this.lastMemberDepositMicro(tripId, userId);
    const now = new Date();
    await this.prisma.tripMember.update({
      where: { tripId_userId: { tripId, userId } },
      data: {
        vaultLeaveRequestedAt: now,
        vaultLeaveRequestNetMicro: snap,
      },
    });

    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
      select: { publicKey: true },
    });

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { createdById: true },
    });

    this.tripsHandler.sendVaultLeaveRequested(tripId, { userId });
    if (trip?.createdById && trip.createdById !== userId) {
      void this.notificationsService.sendVaultLeaveAnnouncedPush(
        trip.createdById,
        tripId,
        member.user.displayName ?? 'Unknown',
      );
    }

    const payout = isMeaningfulVaultCredit(net);
    return {
      request: {
        tripId,
        userId,
        displayName: member.user.displayName ?? 'Unknown',
        avatarUrl: member.user.avatarUrl,
        netMicro: floorVaultLeaveNet(net).toString(),
        announcedNetMicro: snap.toString(),
        status: payout ? 'PAYOUT' : 'READY',
        walletAddress: wallet?.publicKey ?? null,
        requestedAt: now.toISOString(),
      },
    };
  }

  async listVaultLeaveRequests(
    tripId: number,
    hostUserId: number,
  ): Promise<VaultLeaveRequestListDto> {
    await this.assertCreator(tripId, hostUserId);
    const rows = await this.prisma.tripMember.findMany({
      where: {
        tripId,
        inviteStatus: InviteStatus.ACCEPTED,
        vaultLeaveRequestedAt: { not: null },
      },
      select: {
        userId: true,
        vaultLeaveRequestedAt: true,
        vaultLeaveRequestNetMicro: true,
        user: { select: { displayName: true, avatarUrl: true } },
      },
      orderBy: { vaultLeaveRequestedAt: 'asc' },
    });

    const items: VaultLeaveRequestDto[] = [];
    const userIds = rows.map((row) => row.userId);
    const wallets = await this.prisma.walletAccount.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, publicKey: true },
    });
    const walletByUser = new Map(
      wallets.map((w) => [w.userId, w.publicKey] as const),
    );

    for (const row of rows) {
      const liveNet =
        (await this.vaultSettlement.memberNetMicro(tripId, row.userId)) ?? 0n;
      // Status from live balance; READY amount always from vault history deposit.
      let status = 'READY';
      let snap: bigint;
      if (isMeaningfulVaultDebt(liveNet)) {
        status = 'WAITING_DEPOSIT';
        snap = -liveNet;
      } else if (isMeaningfulVaultCredit(liveNet)) {
        status = 'PAYOUT';
        snap = liveNet;
      } else {
        status = 'READY';
        snap = await this.lastMemberDepositMicro(tripId, row.userId);
      }
      const displayNet = floorVaultLeaveNet(liveNet);
      items.push({
        tripId,
        userId: row.userId,
        displayName: row.user.displayName ?? 'Unknown',
        avatarUrl: row.user.avatarUrl,
        netMicro: displayNet.toString(),
        announcedNetMicro: snap.toString(),
        status,
        walletAddress: walletByUser.get(row.userId) ?? null,
        requestedAt: (row.vaultLeaveRequestedAt ?? new Date()).toISOString(),
      });
    }
    return { items };
  }

  /** Latest vault DEPOSIT for this member (host READY "Received" amount). */
  private async lastMemberDepositMicro(
    tripId: number,
    userId: number,
  ): Promise<bigint> {
    const vault = await this.prisma.tripVault.findUnique({
      where: { tripId },
      select: { id: true },
    });
    if (!vault) {
      return 0n;
    }

    const last = await this.prisma.vaultTransaction.findFirst({
      where: {
        tripVaultId: vault.id,
        userId,
        kind: VaultTxKind.DEPOSIT,
        status: { in: [VaultTxStatus.CONFIRMED, VaultTxStatus.PENDING] },
      },
      orderBy: { createdAt: 'desc' },
      select: { amountMicro: true },
    });
    return last?.amountMicro ?? 0n;
  }

  /**
   * Host confirms leave: payout when credit ≥ $0.01, then remove member.
   * Sub-cent dust is written off (no on-chain payout_leave).
   */
  async confirmVaultLeave(
    tripId: number,
    targetUserId: number,
    hostUserId: number,
  ): Promise<VaultLeaveConfirmResultDto> {
    await this.assertCreator(tripId, hostUserId);
    if (targetUserId === hostUserId) {
      throw new BadRequestException('Host cannot confirm their own leave');
    }

    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: targetUserId } },
      select: { vaultLeaveRequestedAt: true },
    });
    if (!member?.vaultLeaveRequestedAt) {
      throw new BadRequestException('This member has not announced leave');
    }

    const net = await this.vaultSettlement.memberNetMicro(tripId, targetUserId);
    if (net === null) {
      throw new BadRequestException('This trip has no group vault');
    }
    if (isMeaningfulVaultDebt(net)) {
      throw new BadRequestException(
        'Member still owes the group; wait for their deposit',
      );
    }

    let payoutPending = false;
    if (isMeaningfulVaultCredit(net)) {
      // Must succeed before remove — otherwise the member keeps their claim.
      await this.vaultSettlement.payoutLeaveMember(tripId, targetUserId);
      payoutPending = true;
    }

    await this.prisma.tripMember.update({
      where: { tripId_userId: { tripId, userId: targetUserId } },
      data: {
        vaultLeaveRequestedAt: null,
        vaultLeaveRequestNetMicro: null,
        vaultLeaveClearedAt: new Date(),
      },
    });

    await this.removeMember(tripId, targetUserId, hostUserId);

    return { completed: true, payoutPending };
  }

  /**
   * Appoints or removes a co-host.
   *
   * Only the trip's creator decides, and only CO_HOST and MEMBER are on
   * offer: HOST belongs to whoever made the trip and is not something to hand
   * around by accident.
   *
   * The chain is told as well, best effort. A vault that cannot be reached must
   * not stop a trip naming its co-host, and syncRoles carries the decision
   * across the next time a member links a wallet.
   */
  async setMemberRole(
    tripId: number,
    targetUserId: number,
    currentUserId: number,
    role: TripMemberRole,
  ): Promise<TripMemberDto> {
    if (role === TripMemberRole.HOST) {
      throw new BadRequestException(
        'HOST belongs to the trip creator and cannot be assigned',
      );
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { createdById: true },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
    if (currentUserId !== trip.createdById) {
      throw new ForbiddenException('Only the creator can change roles');
    }
    if (targetUserId === trip.createdById) {
      throw new BadRequestException('The creator is always the host');
    }

    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: targetUserId } },
    });
    if (!member || member.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new NotFoundException('Member not found');
    }

    const updated = await this.prisma.tripMember.update({
      where: { id: member.id },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            friendCode: true,
            subscriptionStatus: true,
            subscriptionExpiresAt: true,
          },
        },
      },
    });

    try {
      await this.tripVault.setMemberRole(
        tripId,
        targetUserId,
        role === TripMemberRole.CO_HOST,
      );
    } catch (error) {
      this.logger.warn(
        `could not record role for user ${targetUserId} on trip ${tripId}: ${error}`,
      );
    }

    this.tripsHandler.sendTripMemberRoleUpdated(tripId, {
      userId: targetUserId,
      role,
    });

    return this.formatMember(updated);
  }

  async removeMember(
    tripId: number,
    targetUserId: number,
    currentUserId: number,
  ): Promise<LeaveSettlementDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { createdById: true, currency: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    if (targetUserId === trip.createdById) {
      throw new BadRequestException('Creator cannot be removed from the trip');
    }

    if (targetUserId !== currentUserId) {
      if (currentUserId !== trip.createdById) {
        throw new ForbiddenException('Only the creator can remove members');
      }
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { displayName: true },
    });

    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: targetUserId } },
      select: { vaultLeaveClearedAt: true },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const netMicro = await this.vaultSettlement.memberNetMicro(
      tripId,
      targetUserId,
    );
    if (netMicro !== null) {
      const cleared = member.vaultLeaveClearedAt != null;
      if (netMicro > 0n) {
        // Self cannot leave while owed funds. Host confirm (cleared) may remove
        // after a successful leave payout (net should already be ~0).
        if (targetUserId === currentUserId || !cleared) {
          throw new BadRequestException(
            'You still have funds in the group wallet. Receive them when the trip ends, or ask the host to confirm your leave.',
          );
        }
      }
      if (netMicro < 0n && !cleared) {
        const owed = (-netMicro).toString();
        throw new BadRequestException(
          `Deposit ${owed} micro-USDC to the group wallet (or ask the host to mark you paid) before leaving`,
        );
      }
      if (netMicro < 0n && cleared) {
        const deposits = await this.vaultSettlement.memberDepositMicro(
          tripId,
          targetUserId,
        );
        if (deposits === 0n) {
          await this.stripUserFromVaultSpendShares(tripId, targetUserId);
        }
      }
    }

    // Get user's budget contributions (for refund calculation)
    const budgetPayments = await this.prisma.budgetPayment.findMany({
      where: {
        budget: { tripId },
        userId: targetUserId,
        isPaid: true,
      },
    });

    const totalBudgetRefund = budgetPayments.reduce(
      (sum, bp) => sum + Number(bp.amount),
      0,
    );

    // Get user's expense shares
    const userExpenseShares = await this.prisma.expenseShare.findMany({
      where: {
        expense: { tripId },
        userId: targetUserId,
      },
      include: {
        expense: { select: { name: true } },
      },
    });

    const expenses: LeaveSettlementExpenseDto[] = userExpenseShares.map(
      (s) => ({
        expenseName: s.expense.name,
        shareAmount: Number(s.shareAmount),
        isSettled: s.isSettled,
      }),
    );

    const totalExpenseShare = userExpenseShares.reduce(
      (sum, s) => sum + Number(s.shareAmount),
      0,
    );

    const netSettlement = totalBudgetRefund - totalExpenseShare;

    // Delete member, their budget payments, and update expense amounts
    await this.prisma.$transaction(async (tx) => {
      // Delete budget payments
      await tx.budgetPayment.deleteMany({
        where: {
          budget: { tripId },
          userId: targetUserId,
        },
      });

      // Delete expense shares
      await tx.expenseShare.deleteMany({
        where: {
          expense: { tripId },
          userId: targetUserId,
        },
      });

      // Update expense amounts to reflect remaining shares only
      const tripExpenses = await tx.expense.findMany({
        where: { tripId },
        include: { shares: true },
      });

      for (const expense of tripExpenses) {
        const remainingSharesTotal = expense.shares.reduce(
          (sum, share) => sum.add(share.shareAmount),
          new Prisma.Decimal(0),
        );

        if (!expense.amount.equals(remainingSharesTotal)) {
          // Rewriting the total invalidates any stored original-currency
          // provenance (originalAmount × exchangeRate no longer matches the
          // new amount, and a later currency migration would re-derive from
          // the stale originalAmount — resurrecting the removed member's
          // share). Reset to home-currency defaults, exactly like an
          // amount-only updateExpense.
          await tx.expense.update({
            where: { id: expense.id },
            data: {
              amount: remainingSharesTotal,
              originalAmount: remainingSharesTotal,
              originalCurrency: trip.currency,
              exchangeRate: 1,
            },
          });
        }
      }

      // Delete trip member
      await tx.tripMember.delete({
        where: { tripId_userId: { tripId, userId: targetUserId } },
      });
    });

    this.activityService.log(
      tripId,
      currentUserId,
      ActivityAction.MEMBER_REMOVED,
      targetUserId,
      { displayName: targetUser?.displayName },
    );

    const displayName = targetUser?.displayName ?? 'Unknown';
    await this.announceMemberRemoved(tripId, targetUserId, displayName);

    // Send push notification to remaining members
    this.notificationsService.sendMemberLeftPush(
      tripId,
      targetUserId,
      displayName,
    );

    return {
      displayName,
      totalBudgetRefund,
      totalExpenseShare,
      netSettlement,
      expenses,
    };
  }

  /**
   * Vault trips only: clients react to `tripMemberRemoved` by invalidating trip
   * detail and, on the removed user's device, navigating home. A classic trip
   * has never announced a removal, and must not start now.
   */
  private async announceMemberRemoved(
    tripId: number,
    userId: number,
    displayName: string,
  ): Promise<void> {
    if (!(await this.tripVault.hasVault(tripId))) {
      return;
    }
    this.tripsHandler.sendTripMemberRemoved(tripId, { userId, displayName });
  }

  /**
   * Host write-off: drop the leaver from past spend share lists so remaining
   * members absorb the debt and end-trip nets still sum to the vault balance
   * when the leaver never deposited.
   */
  private async stripUserFromVaultSpendShares(
    tripId: number,
    userId: number,
  ): Promise<void> {
    const vault = await this.prisma.tripVault.findUnique({
      where: { tripId },
      select: { id: true },
    });
    if (!vault) {
      return;
    }
    const spends = await this.prisma.vaultTransaction.findMany({
      where: {
        tripVaultId: vault.id,
        kind: VaultTxKind.SPEND,
        status: VaultTxStatus.CONFIRMED,
      },
      select: { id: true, shareWithUserIds: true },
    });
    for (const spend of spends) {
      if (!spend.shareWithUserIds.includes(userId)) {
        continue;
      }
      const next = spend.shareWithUserIds.filter((id) => id !== userId);
      await this.prisma.vaultTransaction.update({
        where: { id: spend.id },
        data: { shareWithUserIds: next },
      });
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async assertMember(tripId: number, userId: number): Promise<void> {
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
      throw new ForbiddenException('Only the trip creator can do this');
    }
  }

  async findTripDetail(tripId: number, userId?: number): Promise<TripDto> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: TRIP_DETAIL_INCLUDE,
    });

    let userMarketplaceRating: number | null = null;
    if (userId !== undefined && trip.marketplaceListingId !== null) {
      const rating = await this.prisma.marketplaceRating.findUnique({
        where: {
          userId_listingId: {
            userId,
            listingId: trip.marketplaceListingId,
          },
        },
        select: { rating: true },
      });
      userMarketplaceRating = rating?.rating ?? null;
    }

    return {
      id: trip.id,
      name: trip.name,
      coverImageUrl: await this.resolveCoverImageUrl(trip.coverImageUrl),
      status: trip.status,
      startDate: trip.startDate?.toISOString() ?? null,
      endDate: trip.endDate?.toISOString() ?? null,
      inviteCode: trip.inviteCode,
      createdById: trip.createdById,
      createdAt: trip.createdAt?.toISOString() ?? new Date().toISOString(),
      currency: trip.currency,
      localCurrencies: trip.localCurrencies,
      location: this.formatLocation(trip.city, trip.state, trip.country),
      marketplaceListingId: trip.marketplaceListingId,
      userMarketplaceRating,
      members: await Promise.all(trip.members.map((m) => this.formatMember(m))),
    };
  }

  private async resolveCoverImageUrl(
    objectKey: string | null,
  ): Promise<string | null> {
    if (!objectKey) return null;
    const { url } = await this.storageService.getSignedThumbUrl(objectKey);
    return url;
  }

  private formatLocation(
    city: { id: number; name: string; latitude?: any; longitude?: any } | null,
    state: { id: number; name: string } | null,
    country: { id: number; name: string } | null,
  ): TripLocationDto | null {
    if (!city && !state && !country) return null;
    return {
      cityId: city?.id ?? null,
      stateId: state?.id ?? null,
      countryId: country?.id ?? null,
      cityName: city?.name ?? null,
      stateName: state?.name ?? null,
      countryName: country?.name ?? null,
      latitude: city?.latitude != null ? Number(city.latitude) : null,
      longitude: city?.longitude != null ? Number(city.longitude) : null,
    };
  }

  private async formatMember(member: {
    id: number;
    userId: number;
    inviteStatus: InviteStatus;
    role: TripMemberRole;
    joinedAt: Date | null;
    user: {
      id: number;
      displayName: string;
      avatarUrl: string | null;
      friendCode: string | null;
      subscriptionStatus: SubscriptionStatus | null;
      subscriptionExpiresAt: Date | null;
    };
  }): Promise<TripMemberDto> {
    // isPro gates Pro-only entitlements on the client (e.g. Android's
    // receipt-scan paywall bypass keys off TripMemberDto.isPro), so — unlike
    // the display-only isUserPro() in auth/friends.service.ts — this one must
    // go through the same stale-ACTIVE guard as subscription.service /
    // scan-credit.service, or a lapsed Google Play subscriber sitting at a
    // stale stored ACTIVE keeps Pro access here indefinitely.
    const storedStatus = member.user.subscriptionStatus;
    const effectiveStatus =
      storedStatus === null
        ? null
        : effectiveSubscriptionStatus({
            subscriptionStatus: storedStatus,
            subscriptionExpiresAt: member.user.subscriptionExpiresAt,
          });

    return {
      id: member.id,
      userId: member.user.id,
      displayName: member.user.displayName,
      avatarUrl: await this.resolveAvatarUrl(member.user.avatarUrl),
      friendCode: member.user.friendCode,
      inviteStatus: member.inviteStatus,
      role: member.role,
      joinedAt: member.joinedAt?.toISOString() ?? null,
      isPro: this.isUserPro(effectiveStatus),
    };
  }

  private isUserPro(status: SubscriptionStatus | null): boolean {
    const proStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.GRACE_PERIOD,
    ];
    return status !== null && proStatuses.includes(status);
  }

  private async resolveAvatarUrl(value: string | null): Promise<string | null> {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    try {
      const { url } = await this.storageService.getSignedThumbUrl(value);
      return url;
    } catch {
      return null;
    }
  }

  /** HH:mm in Vietnam time for leave ledger rows (product is VN-first). */
  private formatLeaveTime(iso: string): string {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(d);
  }
}
