import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ActivityAction, InviteStatus, TripStatus } from '@prisma/client';
import { localDateInTimezone, parseTimezone } from '../common/timezone.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TripsHandler } from '../realtime/handlers/trips.handler';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import {
  convertDayNumbersToPlanDates,
  findOngoingConflictNames,
} from './trip-start.helpers';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Flips PLANNING trips to ONGOING once their start date arrives in the trip
 * country's local timezone (UTC when the trip has no country). Mirrors the
 * manual "Start Trip Now" path: same member-conflict rule, same dayNumber →
 * planDate conversion. A conflict leaves the trip PLANNING and pushes the
 * creator; `autoStartAttemptedAt` is stamped either way so each trip is
 * attempted once.
 */
@Injectable()
export class TripAutoStartService {
  private readonly logger = new Logger(TripAutoStartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly tripsHandler: TripsHandler,
    private readonly activityService: TripActivityService,
  ) {}

  @Cron('*/15 * * * *', { name: 'tripAutoStart', waitForCompletion: true })
  async run(now: Date = new Date()): Promise<void> {
    if (this.config.get<string>('TRIP_AUTO_START_ENABLED') === 'false') return;

    // startDate is @db.Date (UTC midnight). Overfetch by one day so trips in
    // UTC+ zones that are already "today" locally are included; the exact
    // per-timezone check happens below.
    const cutoff = new Date(now.getTime() + MS_PER_DAY);
    const dueTrips = await this.prisma.trip.findMany({
      where: {
        status: TripStatus.PLANNING,
        autoStartAttemptedAt: null,
        startDate: { lte: cutoff },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        createdById: true,
        country: { select: { id: true, timezones: true } },
        members: {
          where: { inviteStatus: InviteStatus.ACCEPTED },
          select: { userId: true },
        },
      },
    });

    for (const trip of dueTrips) {
      if (!trip.startDate) continue;
      const timezone = parseTimezone(trip.country?.timezones ?? null) ?? 'UTC';
      const localToday = localDateInTimezone(timezone, now);
      if (localToday.getTime() < trip.startDate.getTime()) continue;

      try {
        await this.startTrip(trip, now);
      } catch (err) {
        this.logger.error(
          `Auto-start failed for trip ${trip.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async startTrip(
    trip: {
      id: number;
      name: string;
      startDate: Date | null;
      createdById: number;
      members: { userId: number }[];
    },
    now: Date,
  ): Promise<void> {
    const conflictNames = await findOngoingConflictNames(this.prisma, trip.id);
    if (conflictNames.length > 0) {
      await this.prisma.trip.update({
        where: { id: trip.id },
        data: { autoStartAttemptedAt: now },
      });
      this.logger.log(
        `Trip ${trip.id} not auto-started: ${conflictNames.join(', ')} on another ongoing trip`,
      );
      await this.notifications.sendTripAutoStartBlockedPush(
        trip.createdById,
        trip.id,
        trip.name,
        conflictNames,
      );
      return;
    }

    // Status guard makes this atomic against a concurrent manual start:
    // 0 rows means someone else already moved it, so we do nothing more.
    const { count } = await this.prisma.trip.updateMany({
      where: { id: trip.id, status: TripStatus.PLANNING },
      data: { status: TripStatus.ONGOING, autoStartAttemptedAt: now },
    });
    if (count === 0) return;

    await convertDayNumbersToPlanDates(
      this.prisma,
      trip.id,
      trip.startDate ?? now,
    );

    await this.activityService.log(
      trip.id,
      trip.createdById,
      ActivityAction.TRIP_UPDATED,
      undefined,
      { name: trip.name, autoStarted: true },
    );

    this.tripsHandler.sendTripStarted(trip.id);
    await this.notifications.sendTripStartedPush(
      trip.id,
      trip.name,
      trip.members.map((m) => m.userId),
    );
    this.logger.log(`Trip ${trip.id} auto-started`);
  }
}
