import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InviteStatus, ExpenseCategory } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TripActivityService } from '../../src/trip-activity/trip-activity.service';
import { PlanItemsService } from '../../src/plan-items/plan-items.service';

describe('PlanItemsService', () => {
  let service: PlanItemsService;
  let prisma: Record<string, any>;
  let activityService: Record<string, any>;

  const mockAcceptedMember = {
    id: 1,
    tripId: 1,
    userId: 1,
    inviteStatus: InviteStatus.ACCEPTED,
    joinedAt: new Date(),
  };

  const mockMembers = [
    { id: 1, tripId: 1, userId: 1, inviteStatus: InviteStatus.ACCEPTED },
    { id: 2, tripId: 1, userId: 2, inviteStatus: InviteStatus.ACCEPTED },
    { id: 3, tripId: 1, userId: 3, inviteStatus: InviteStatus.ACCEPTED },
  ];

  const mockItem = {
    id: 1,
    tripId: 1,
    planDate: new Date('2026-04-01'),
    title: 'Visit Museum',
    description: 'Modern art museum',
    location: 'Downtown',
    startTime: '09:30',
    category: ExpenseCategory.TICKET,
    notes: ['Bring camera'],
    voiceUrl: null,
    voiceDuration: null,
    sortOrder: 0,
    createdAt: new Date('2026-03-18'),
  };

  const mockMemberRows = [
    {
      id: 10,
      tripPlanItemId: 1,
      userId: 1,
      user: { id: 1, displayName: 'User One', avatarUrl: null },
    },
    {
      id: 11,
      tripPlanItemId: 1,
      userId: 2,
      user: { id: 2, displayName: 'User Two', avatarUrl: 'https://img/2.png' },
    },
  ];

  const mockItemWithMembers = {
    ...mockItem,
    members: mockMemberRows,
  };

  beforeEach(() => {
    prisma = {
      tripMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      tripPlanItem: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      tripPlanItemMember: {
        createMany: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(prisma)),
    };

    activityService = { log: jest.fn() };

    service = new PlanItemsService(
      prisma as unknown as PrismaService,
      activityService as unknown as TripActivityService,
    );
  });

  describe('createPlanItem', () => {
    it('should create a plan item with specific userIds', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue([
        mockMembers[0],
        mockMembers[1],
      ]);
      prisma.tripPlanItem.create.mockResolvedValue(mockItem);
      prisma.tripPlanItemMember.createMany.mockResolvedValue({ count: 2 });
      prisma.tripPlanItem.findUniqueOrThrow.mockResolvedValue(
        mockItemWithMembers,
      );

      const result = await service.createPlanItem(1, 1, {
        title: 'Visit Museum',
        planDate: '2026-04-01',
        description: 'Modern art museum',
        userIds: [1, 2],
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.tripPlanItemMember.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ tripPlanItemId: 1, userId: 1 }),
            expect.objectContaining({ tripPlanItemId: 1, userId: 2 }),
          ]),
        }),
      );
      expect(result.id).toBe(1);
      expect(result.members).toHaveLength(2);
      expect(result.planDate).toBe('2026-04-01');
    });

    it('should silently filter out non-accepted members and assign accepted ones', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue([
        mockMembers[0],
        mockMembers[1],
      ]);
      prisma.tripPlanItem.create.mockResolvedValue(mockItem);
      prisma.tripPlanItemMember.createMany.mockResolvedValue({ count: 2 });
      prisma.tripPlanItem.findUniqueOrThrow.mockResolvedValue(
        mockItemWithMembers,
      );

      const result = await service.createPlanItem(1, 1, {
        title: 'Visit Museum',
        planDate: '2026-04-01',
        userIds: [1, 2, 999],
      });

      expect(prisma.tripMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tripId: 1,
            inviteStatus: InviteStatus.ACCEPTED,
            userId: { in: [1, 2, 999] },
          },
        }),
      );
      expect(prisma.tripPlanItemMember.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ userId: 1 }),
            expect.objectContaining({ userId: 2 }),
          ]),
        }),
      );
      expect(result.members).toHaveLength(2);
    });

    it('should throw BadRequestException when no accepted members found', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue([]);
      prisma.tripPlanItem.create.mockResolvedValue(mockItem);

      await expect(
        service.createPlanItem(1, 1, {
          title: 'Visit Museum',
          planDate: '2026-04-01',
          userIds: [999],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(
        service.createPlanItem(1, 99, {
          title: 'Test',
          planDate: '2026-04-01',
          userIds: [1],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listPlanItems', () => {
    it('should return items for a specific date ordered correctly', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findMany.mockResolvedValue([mockItemWithMembers]);

      const result = await service.listPlanItems(1, 1, '2026-04-01');

      expect(prisma.tripPlanItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tripId: 1, planDate: new Date('2026-04-01') },
          orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Visit Museum');
      expect(result[0].members).toHaveLength(2);
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(service.listPlanItems(1, 99, '2026-04-01')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getPlanItem', () => {
    it('should return a plan item with members', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 1 });
      prisma.tripPlanItem.findUniqueOrThrow.mockResolvedValue(
        mockItemWithMembers,
      );

      const result = await service.getPlanItem(1, 1, 1);

      expect(result.id).toBe(1);
      expect(result.members).toHaveLength(2);
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(service.getPlanItem(1, 1, 99)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when item belongs to a different trip', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 999 });

      await expect(service.getPlanItem(1, 1, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updatePlanItem', () => {
    it('should update item fields', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 1 });
      prisma.tripPlanItem.update.mockResolvedValue(mockItem);
      prisma.tripPlanItem.findUniqueOrThrow.mockResolvedValue(
        mockItemWithMembers,
      );

      const result = await service.updatePlanItem(1, 1, 1, {
        title: 'Updated Title',
      });

      expect(prisma.tripPlanItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ title: 'Updated Title' }),
        }),
      );
      expect(result.id).toBe(1);
    });

    it('should replace members when userIds is provided', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 1 });
      prisma.tripMember.findMany.mockResolvedValue([mockMembers[0]]);
      prisma.tripPlanItem.update.mockResolvedValue(mockItem);
      prisma.tripPlanItemMember.deleteMany.mockResolvedValue({ count: 2 });
      prisma.tripPlanItemMember.createMany.mockResolvedValue({ count: 1 });
      prisma.tripPlanItem.findUniqueOrThrow.mockResolvedValue({
        ...mockItem,
        members: [mockMemberRows[0]],
      });

      const result = await service.updatePlanItem(1, 1, 1, {
        title: 'Updated',
        userIds: [1],
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.tripPlanItemMember.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tripPlanItemId: 1 },
        }),
      );
      expect(prisma.tripPlanItemMember.createMany).toHaveBeenCalled();
      expect(result.members).toHaveLength(1);
    });

    it('should leave members unchanged when userIds is omitted', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 1 });
      prisma.tripPlanItem.update.mockResolvedValue(mockItem);
      prisma.tripPlanItem.findUniqueOrThrow.mockResolvedValue(
        mockItemWithMembers,
      );

      await service.updatePlanItem(1, 1, 1, { title: 'Updated' });

      expect(prisma.tripPlanItemMember.deleteMany).not.toHaveBeenCalled();
      expect(prisma.tripPlanItemMember.createMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid member IDs', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 1 });
      prisma.tripMember.findMany.mockResolvedValue([mockMembers[0]]);

      await expect(
        service.updatePlanItem(1, 1, 1, { userIds: [1, 999] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deletePlanItem', () => {
    it('should delete a plan item', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 1 });
      prisma.tripPlanItem.delete.mockResolvedValue(mockItem);

      await service.deletePlanItem(1, 1, 1);

      expect(prisma.tripPlanItem.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(service.deletePlanItem(1, 1, 99)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when item belongs to a different trip', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 999 });

      await expect(service.deletePlanItem(1, 1, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addPlanItemMembers', () => {
    it('should add members with skipDuplicates', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 1 });
      prisma.tripMember.findMany.mockResolvedValue([mockMembers[2]]);
      prisma.tripPlanItemMember.createMany.mockResolvedValue({ count: 1 });
      prisma.tripPlanItemMember.findMany.mockResolvedValue([
        ...mockMemberRows,
        {
          id: 12,
          tripPlanItemId: 1,
          userId: 3,
          user: { id: 3, displayName: 'User Three', avatarUrl: null },
        },
      ]);

      const result = await service.addPlanItemMembers(1, 1, 1, {
        userIds: [3],
      });

      expect(prisma.tripPlanItemMember.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skipDuplicates: true,
        }),
      );
      expect(result).toHaveLength(3);
    });

    it('should throw BadRequestException for invalid member IDs', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 1 });
      prisma.tripMember.findMany.mockResolvedValue([]);

      await expect(
        service.addPlanItemMembers(1, 1, 1, { userIds: [999] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removePlanItemMember', () => {
    it('should remove a member from the plan item', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 1 });
      prisma.tripPlanItemMember.delete.mockResolvedValue({ id: 10 });

      await service.removePlanItemMember(1, 1, 2, 1);

      expect(prisma.tripPlanItemMember.delete).toHaveBeenCalledWith({
        where: {
          tripPlanItemId_userId: { tripPlanItemId: 1, userId: 2 },
        },
      });
    });

    it('should throw NotFoundException when member is not found', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripPlanItem.findUnique.mockResolvedValue({ id: 1, tripId: 1 });
      prisma.tripPlanItemMember.delete.mockRejectedValue(
        new Error('Record to delete does not exist.'),
      );

      await expect(service.removePlanItemMember(1, 1, 999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
