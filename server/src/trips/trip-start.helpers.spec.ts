/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { InviteStatus, TripStatus } from '@prisma/client';
import {
  convertDayNumbersToPlanDates,
  findOngoingConflictNames,
} from './trip-start.helpers';

describe('trip-start helpers', () => {
  describe('findOngoingConflictNames', () => {
    it('returns distinct display names of members already on another ongoing trip', async () => {
      const prisma = {
        tripMember: {
          findMany: jest.fn().mockResolvedValue([
            { userId: 1, user: { displayName: 'Ken' } },
            { userId: 2, user: { displayName: 'Ann' } },
          ]),
        },
        trip: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { members: [{ user: { displayName: 'Ken' } }] },
              { members: [{ user: { displayName: 'Ken' } }] },
            ]),
        },
      };

      const names = await findOngoingConflictNames(prisma as any, 10);

      expect(names).toEqual(['Ken']);
      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 10 },
            status: TripStatus.ONGOING,
            members: {
              some: {
                userId: { in: [1, 2] },
                inviteStatus: InviteStatus.ACCEPTED,
              },
            },
          }),
        }),
      );
    });

    it('returns an empty list when nobody conflicts', async () => {
      const prisma = {
        tripMember: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ userId: 1, user: { displayName: 'Ken' } }]),
        },
        trip: { findMany: jest.fn().mockResolvedValue([]) },
      };
      expect(await findOngoingConflictNames(prisma as any, 10)).toEqual([]);
    });
  });

  describe('convertDayNumbersToPlanDates', () => {
    it('sets planDate = startDate + (dayNumber - 1) days for items without a planDate', async () => {
      const prisma = {
        tripPlanItem: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, dayNumber: 1, planDate: null },
            { id: 2, dayNumber: 3, planDate: null },
            { id: 3, dayNumber: 2, planDate: new Date('2026-01-01T00:00:00Z') },
          ]),
          update: jest.fn().mockResolvedValue({}),
        },
      };

      await convertDayNumbersToPlanDates(
        prisma as any,
        10,
        new Date('2026-09-22T00:00:00Z'),
      );

      expect(prisma.tripPlanItem.update).toHaveBeenCalledTimes(2);
      expect(prisma.tripPlanItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { planDate: new Date('2026-09-22T00:00:00Z') },
      });
      expect(prisma.tripPlanItem.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { planDate: new Date('2026-09-24T00:00:00Z') },
      });
    });
  });
});
