/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ActivityAction, TripStatus } from '@prisma/client';
import { TripAutoStartService } from './trip-auto-start.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TripsHandler } from '../realtime/handlers/trips.handler';
import { TripActivityService } from '../trip-activity/trip-activity.service';

const VN_TZ = '[{"zoneName":"Asia/Ho_Chi_Minh","gmtOffset":25200}]';

function makeTrip(overrides: Partial<any> = {}) {
  return {
    id: 10,
    name: 'Da Lat',
    status: TripStatus.PLANNING,
    startDate: new Date('2026-09-22T00:00:00Z'),
    createdById: 1,
    country: { id: 1, timezones: VN_TZ },
    members: [{ userId: 1 }, { userId: 2 }],
    ...overrides,
  };
}

describe('TripAutoStartService', () => {
  let service: TripAutoStartService;
  let prisma: any;
  let notifications: any;
  let tripsHandler: any;
  let activity: any;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      trip: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      tripMember: { findMany: jest.fn().mockResolvedValue([]) },
      tripPlanItem: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    notifications = {
      sendTripStartedPush: jest.fn().mockResolvedValue(undefined),
      sendTripAutoStartBlockedPush: jest.fn().mockResolvedValue(undefined),
    };
    tripsHandler = { sendTripStarted: jest.fn() };
    activity = { log: jest.fn().mockResolvedValue(undefined) };
    config = { get: jest.fn().mockReturnValue('true') };

    const module = await Test.createTestingModule({
      providers: [
        TripAutoStartService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: TripsHandler, useValue: tripsHandler },
        { provide: TripActivityService, useValue: activity },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(TripAutoStartService);
  });

  it('does nothing when TRIP_AUTO_START_ENABLED is false', async () => {
    config.get.mockReturnValue('false');
    await service.run();
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
  });

  it('starts a trip whose start date has arrived in its local timezone', async () => {
    // 2026-09-21 18:00 UTC = 2026-09-22 01:00 in Asia/Ho_Chi_Minh
    const now = new Date('2026-09-21T18:00:00Z');
    prisma.trip.findMany.mockResolvedValueOnce([makeTrip()]);
    prisma.tripPlanItem.findMany.mockResolvedValue([
      { id: 5, dayNumber: 2, planDate: null },
    ]);

    await service.run(now);

    expect(prisma.trip.updateMany).toHaveBeenCalledWith({
      where: { id: 10, status: TripStatus.PLANNING },
      data: expect.objectContaining({
        status: TripStatus.ONGOING,
        autoStartAttemptedAt: now,
      }),
    });
    expect(prisma.tripPlanItem.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { planDate: new Date('2026-09-23T00:00:00Z') },
    });
    expect(activity.log).toHaveBeenCalledWith(
      10,
      1,
      ActivityAction.TRIP_UPDATED,
      undefined,
      { name: 'Da Lat', autoStarted: true },
    );
    expect(tripsHandler.sendTripStarted).toHaveBeenCalledWith(10);
    expect(notifications.sendTripStartedPush).toHaveBeenCalledWith(
      10,
      'Da Lat',
      [1, 2],
    );
  });

  it('skips a trip whose start date has not yet arrived locally', async () => {
    // 2026-09-21 16:00 UTC = 2026-09-21 23:00 in Asia/Ho_Chi_Minh
    const now = new Date('2026-09-21T16:00:00Z');
    prisma.trip.findMany.mockResolvedValueOnce([makeTrip()]);

    await service.run(now);

    expect(prisma.trip.updateMany).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
  });

  it('falls back to UTC when the trip has no country timezone', async () => {
    const now = new Date('2026-09-22T00:30:00Z');
    prisma.trip.findMany.mockResolvedValueOnce([makeTrip({ country: null })]);

    await service.run(now);

    expect(prisma.trip.updateMany).toHaveBeenCalled();
  });

  it('leaves the trip PLANNING, stamps the attempt and pushes the creator on a member conflict', async () => {
    const now = new Date('2026-09-22T05:00:00Z');
    prisma.trip.findMany
      .mockResolvedValueOnce([makeTrip()]) // due trips
      .mockResolvedValueOnce([{ members: [{ user: { displayName: 'Ann' } }] }]); // conflicts
    prisma.tripMember.findMany.mockResolvedValue([
      { userId: 1, user: { displayName: 'Ken' } },
      { userId: 2, user: { displayName: 'Ann' } },
    ]);

    await service.run(now);

    expect(prisma.trip.updateMany).not.toHaveBeenCalled();
    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { autoStartAttemptedAt: now },
    });
    expect(notifications.sendTripAutoStartBlockedPush).toHaveBeenCalledWith(
      1,
      10,
      'Da Lat',
      ['Ann'],
    );
    expect(notifications.sendTripStartedPush).not.toHaveBeenCalled();
    expect(tripsHandler.sendTripStarted).not.toHaveBeenCalled();
  });

  it('does not notify when the trip was started concurrently (guarded update affected 0 rows)', async () => {
    prisma.trip.findMany.mockResolvedValueOnce([makeTrip()]);
    prisma.trip.updateMany.mockResolvedValue({ count: 0 });

    await service.run(new Date('2026-09-22T05:00:00Z'));

    expect(notifications.sendTripStartedPush).not.toHaveBeenCalled();
    expect(tripsHandler.sendTripStarted).not.toHaveBeenCalled();
    expect(prisma.tripPlanItem.update).not.toHaveBeenCalled();
  });

  it('continues with the next trip when one throws', async () => {
    // First call = due trips; later calls (conflict lookups) use the [] default.
    prisma.trip.findMany.mockResolvedValueOnce([
      makeTrip({ id: 10 }),
      makeTrip({ id: 11 }),
    ]);
    prisma.trip.updateMany
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ count: 1 });

    await service.run(new Date('2026-09-22T05:00:00Z'));

    expect(tripsHandler.sendTripStarted).toHaveBeenCalledWith(11);
  });

  it('only queries PLANNING trips with a start date that have not been attempted', async () => {
    await service.run(new Date('2026-09-22T05:00:00Z'));
    expect(prisma.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: TripStatus.PLANNING,
          autoStartAttemptedAt: null,
          startDate: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
  });
});
