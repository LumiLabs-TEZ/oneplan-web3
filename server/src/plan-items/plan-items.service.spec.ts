import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InviteStatus, MarketplaceListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { MarketplaceAcquisitionService } from '../marketplace/acquisition/marketplace-acquisition.service';
import { PlanItemsService } from './plan-items.service';

describe('PlanItemsService', () => {
  let service: PlanItemsService;
  let prisma: any;
  let activityService: Pick<TripActivityService, 'log'>;
  let storageService: Pick<
    StorageService,
    'deleteObject' | 'extractObjectKey' | 'getSignedThumbUrl' | 'copyToTarget'
  >;

  beforeEach(() => {
    prisma = {
      tripMember: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      marketplaceAcquisition: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      acquisitionItem: {
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      marketplaceListing: {
        findUnique: jest.fn(),
      },
      trip: {
        findUnique: jest.fn().mockResolvedValue({ marketplaceListingId: null }),
        updateMany: jest.fn(),
      },
      tripPlanItem: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      tripPlanItemMember: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    activityService = { log: jest.fn() };
    storageService = {
      deleteObject: jest.fn(),
      // Mirrors the real behavior for our GCS bucket URLs closely enough:
      // strips a known host prefix, passes bare keys through.
      extractObjectKey: jest.fn((value: string) =>
        value.replace(/^https:\/\/storage\.googleapis\.com\/bucket\//, ''),
      ),
      getSignedThumbUrl: jest.fn((key: string) =>
        Promise.resolve({ url: `https://signed/${key}`, expiresIn: 3600 }),
      ),
      copyToTarget: jest.fn((sourceKey: string, _target, entityId: number) =>
        Promise.resolve(
          `trips/${entityId}/plan-images/copy-of-${sourceKey.split('/').pop()}`,
        ),
      ),
    };

    service = new PlanItemsService(
      prisma as PrismaService,
      activityService as TripActivityService,
      storageService as StorageService,
      { track: jest.fn() } as any,
      { onPlanApplied: jest.fn() } as any,
      new MarketplaceAcquisitionService(prisma as PrismaService),
      { get: jest.fn().mockReturnValue(null) } as any,
    );
  });

  describe('applyAcquisitionToTrip', () => {
    const tripId = 10;
    const acquisitionId = 20;
    const userId = 1;

    beforeEach(() => {
      prisma.tripMember.findUnique.mockResolvedValue({
        tripId,
        userId,
        inviteStatus: InviteStatus.ACCEPTED,
      });
    });

    it('throws ForbiddenException if user is not a trip member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(
        service.applyAcquisitionToTrip(tripId, acquisitionId, userId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if acquisition is missing', async () => {
      prisma.marketplaceAcquisition.findUnique.mockResolvedValue(null);

      await expect(
        service.applyAcquisitionToTrip(tripId, acquisitionId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if acquisition belongs to another user', async () => {
      prisma.marketplaceAcquisition.findUnique.mockResolvedValue({
        id: acquisitionId,
        userId: 999,
        listingId: 5,
        items: [{ id: 1 }],
      });

      await expect(
        service.applyAcquisitionToTrip(tripId, acquisitionId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if acquired plan has no items', async () => {
      prisma.marketplaceAcquisition.findUnique.mockResolvedValue({
        id: acquisitionId,
        userId,
        listingId: 5,
        items: [],
      });

      await expect(
        service.applyAcquisitionToTrip(tripId, acquisitionId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if plan is already applied to this trip', async () => {
      prisma.marketplaceAcquisition.findUnique.mockResolvedValue({
        id: acquisitionId,
        userId,
        listingId: 5,
        items: [{ id: 1, dayNumber: 1, sortOrder: 0 }],
      });
      prisma.trip.findUnique.mockResolvedValue({ marketplaceListingId: 5 });

      await expect(
        service.applyAcquisitionToTrip(tripId, acquisitionId, userId),
      ).rejects.toThrow(ConflictException);
    });

    it('copies acquired items into trip plan items and tags trip with listingId', async () => {
      prisma.marketplaceAcquisition.findUnique.mockResolvedValue({
        id: acquisitionId,
        userId,
        listingId: 5,
        items: [
          {
            id: 100,
            dayNumber: 1,
            title: 'Visit Temple',
            description: 'Morning visit',
            location: 'Old Quarter',
            startTime: '09:00',
            category: 'TICKET',
            imageUrls: [],
            sortOrder: 0,
          },
          {
            id: 101,
            dayNumber: 1,
            title: 'Lunch',
            description: null,
            location: 'Pho Street',
            startTime: '12:00',
            category: 'FOOD',
            imageUrls: [],
            sortOrder: 1,
          },
        ],
      });

      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
      ]);

      let seq = 0;
      prisma.tripPlanItem.create.mockImplementation(() => {
        seq++;
        return Promise.resolve({ id: 200 + seq });
      });

      const now = new Date();
      prisma.tripPlanItem.findMany.mockResolvedValue([
        {
          id: 201,
          tripId,
          planDate: null,
          dayNumber: 1,
          title: 'Visit Temple',
          description: 'Morning visit',
          location: 'Old Quarter',
          startTime: '09:00',
          category: 'TICKET',
          voiceUrl: null,
          voiceDuration: null,
          sortOrder: 0,
          createdAt: now,
          members: [],
        },
      ]);

      await service.applyAcquisitionToTrip(tripId, acquisitionId, userId);

      expect(prisma.trip.updateMany).toHaveBeenCalledWith({
        where: { id: tripId, marketplaceListingId: null },
        data: { marketplaceListingId: 5 },
      });
      expect(prisma.tripPlanItem.create).toHaveBeenCalledTimes(2);
      expect(prisma.tripPlanItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tripId,
          title: 'Visit Temple',
          dayNumber: 1,
        }),
      });
      expect(activityService.log).toHaveBeenCalledWith(
        tripId,
        userId,
        'PLAN_ITEM_CREATED',
        201,
        { title: `Applied acquired plan #${acquisitionId}` },
      );
    });

    it('skips trip.updateMany when acquisition listingId is null (listing was deleted)', async () => {
      prisma.marketplaceAcquisition.findUnique.mockResolvedValue({
        id: acquisitionId,
        userId,
        listingId: null,
        items: [
          {
            id: 100,
            dayNumber: 1,
            title: 'Orphaned snapshot',
            description: null,
            location: null,
            startTime: null,
            category: null,
            imageUrls: [],
            sortOrder: 0,
          },
        ],
      });

      prisma.tripPlanItem.create.mockResolvedValue({ id: 500 });
      prisma.tripPlanItem.findMany.mockResolvedValue([]);

      await service.applyAcquisitionToTrip(tripId, acquisitionId, userId);

      expect(prisma.trip.updateMany).not.toHaveBeenCalled();
    });

    it('copies snapshot images into trip-owned keys on the created plan items', async () => {
      prisma.marketplaceAcquisition.findUnique.mockResolvedValue({
        id: acquisitionId,
        userId,
        listingId: null,
        items: [
          {
            id: 100,
            dayNumber: 1,
            title: 'With photos',
            description: null,
            location: null,
            startTime: null,
            category: null,
            imageUrls: [
              'marketplace/9/images/a.jpg',
              'marketplace/9/images/b.jpg',
            ],
            sortOrder: 0,
          },
        ],
      });
      prisma.tripPlanItem.create.mockResolvedValue({ id: 700 });
      prisma.tripPlanItem.findMany.mockResolvedValue([]);

      await service.applyAcquisitionToTrip(tripId, acquisitionId, userId);

      expect(storageService.copyToTarget).toHaveBeenCalledTimes(2);
      expect(storageService.copyToTarget).toHaveBeenCalledWith(
        'marketplace/9/images/a.jpg',
        'plan-item-image',
        tripId,
      );
      expect(prisma.tripPlanItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          imageUrls: [
            `trips/${tripId}/plan-images/copy-of-a.jpg`,
            `trips/${tripId}/plan-images/copy-of-b.jpg`,
          ],
        }),
      });
    });

    it('skips images whose copy fails but still creates the item with the rest', async () => {
      prisma.marketplaceAcquisition.findUnique.mockResolvedValue({
        id: acquisitionId,
        userId,
        listingId: null,
        items: [
          {
            id: 100,
            dayNumber: 1,
            title: 'Partial photos',
            description: null,
            location: null,
            startTime: null,
            category: null,
            imageUrls: [
              'marketplace/9/images/bad.jpg',
              'marketplace/9/images/ok.jpg',
            ],
            sortOrder: 0,
          },
        ],
      });
      (storageService.copyToTarget as jest.Mock)
        .mockRejectedValueOnce(new Error('copy failed'))
        .mockResolvedValueOnce(`trips/${tripId}/plan-images/copy-of-ok.jpg`);
      prisma.tripPlanItem.create.mockResolvedValue({ id: 701 });
      prisma.tripPlanItem.findMany.mockResolvedValue([]);

      await service.applyAcquisitionToTrip(tripId, acquisitionId, userId);

      expect(prisma.tripPlanItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          imageUrls: [`trips/${tripId}/plan-images/copy-of-ok.jpg`],
        }),
      });
    });

    it('refreshes a stale snapshot from the approved listing before copying', async () => {
      const acquiredAt = new Date('2026-01-01T00:00:00.000Z');
      const refreshedAt = new Date('2026-04-01T00:00:00.000Z');
      prisma.marketplaceAcquisition.findUnique.mockResolvedValue({
        id: acquisitionId,
        userId,
        listingId: 5,
        acquiredAt,
        snapshotSourceUpdatedAt: acquiredAt,
        items: [
          {
            id: 100,
            dayNumber: 1,
            title: 'Old item',
            description: null,
            location: null,
            startTime: null,
            category: null,
            imageUrls: ['marketplace/9/images/old.jpg'],
            sortOrder: 0,
          },
        ],
      });
      prisma.marketplaceListing.findUnique.mockResolvedValue({
        id: 5,
        createdById: 99,
        status: MarketplaceListingStatus.APPROVED,
        deletedAt: null,
        sourceLocale: 'vi',
        name: 'New plan',
        description: null,
        coverImageUrl: null,
        cityId: null,
        stateId: null,
        countryId: null,
        price: 0,
        currency: 'VND',
        durationDays: 2,
        tags: [],
        updatedAt: refreshedAt,
        createdBy: { displayName: 'Creator', avatarUrl: null },
        translations: [],
        items: [
          {
            id: 200,
            dayNumber: 1,
            title: 'New item',
            description: null,
            location: null,
            latitude: null,
            longitude: null,
            address: null,
            startTime: null,
            category: null,
            imageUrls: ['marketplace/9/images/new.jpg'],
            sortOrder: 0,
            createdAt: acquiredAt,
            updatedAt: refreshedAt,
            translations: [],
          },
        ],
      });
      prisma.marketplaceAcquisition.updateMany.mockResolvedValue({ count: 1 });
      prisma.acquisitionItem.findMany.mockResolvedValue([
        {
          id: 900,
          dayNumber: 1,
          title: 'New item',
          description: null,
          location: null,
          startTime: null,
          category: null,
          imageUrls: ['marketplace/9/images/new.jpg'],
          sortOrder: 0,
        },
      ]);
      prisma.tripPlanItem.create.mockResolvedValue({ id: 702 });
      prisma.tripPlanItem.findMany.mockResolvedValue([]);

      await service.applyAcquisitionToTrip(tripId, acquisitionId, userId);

      expect(prisma.marketplaceAcquisition.updateMany).toHaveBeenCalled();
      expect(prisma.acquisitionItem.deleteMany).toHaveBeenCalledWith({
        where: { acquisitionId },
      });
      expect(storageService.copyToTarget).toHaveBeenCalledWith(
        'marketplace/9/images/new.jpg',
        'plan-item-image',
        tripId,
      );
      expect(prisma.tripPlanItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'New item' }),
        }),
      );
    });
  });

  describe('updatePlanItem', () => {
    const tripId = 10;
    const itemId = 42;
    const userId = 1;

    beforeEach(() => {
      prisma.tripMember.findUnique.mockResolvedValue({
        tripId,
        userId,
        inviteStatus: InviteStatus.ACCEPTED,
      });
      prisma.tripPlanItem.findUnique.mockResolvedValue({
        id: itemId,
        title: 'Old title',
        tripId,
        voiceUrl: null,
      });
      prisma.tripPlanItem.update.mockResolvedValue({ id: itemId });
      prisma.tripPlanItem.findUniqueOrThrow.mockResolvedValue({
        id: itemId,
        tripId,
        planDate: null,
        dayNumber: 1,
        title: 'Old title',
        description: null,
        location: null,
        latitude: null,
        longitude: null,
        address: null,
        startTime: null,
        category: null,
        voiceUrl: null,
        voiceDuration: null,
        sortOrder: 0,
        createdAt: new Date(),
        members: [],
      });
    });

    it('clears the note when description is an empty string (stores null)', async () => {
      await service.updatePlanItem(tripId, itemId, userId, {
        description: '',
      } as any);

      expect(prisma.tripPlanItem.update).toHaveBeenCalledWith({
        where: { id: itemId },
        data: expect.objectContaining({ description: null }),
      });
    });

    it('leaves the note untouched when description is omitted', async () => {
      await service.updatePlanItem(tripId, itemId, userId, {
        title: 'New title',
      } as any);

      const call = prisma.tripPlanItem.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('description');
    });

    it('normalizes echoed signed thumb URLs back to original object keys', async () => {
      await service.updatePlanItem(tripId, itemId, userId, {
        imageUrls: [
          'https://storage.googleapis.com/bucket/trips/10/plan-images/a.jpg.thumb.webp',
          'trips/10/plan-images/b.jpg',
        ],
      } as any);

      expect(prisma.tripPlanItem.update).toHaveBeenCalledWith({
        where: { id: itemId },
        data: expect.objectContaining({
          imageUrls: [
            'trips/10/plan-images/a.jpg',
            'trips/10/plan-images/b.jpg',
          ],
        }),
      });
      // Full-replace semantics never delete storage objects on update.
      expect(storageService.deleteObject).not.toHaveBeenCalled();
    });

    it('leaves imageUrls untouched when omitted', async () => {
      await service.updatePlanItem(tripId, itemId, userId, {
        title: 'New title',
      } as any);

      const call = prisma.tripPlanItem.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('imageUrls');
    });

    it('signs stored image keys into thumb URLs on the returned DTO', async () => {
      prisma.tripPlanItem.findUniqueOrThrow.mockResolvedValue({
        id: itemId,
        tripId,
        planDate: null,
        dayNumber: 1,
        title: 'Old title',
        description: null,
        location: null,
        latitude: null,
        longitude: null,
        address: null,
        startTime: null,
        category: null,
        voiceUrl: null,
        voiceDuration: null,
        imageUrls: ['trips/10/plan-images/a.jpg'],
        sortOrder: 0,
        createdAt: new Date(),
        members: [],
      });

      const dto = await service.updatePlanItem(tripId, itemId, userId, {
        title: 'New title',
      } as any);

      expect(dto.imageUrls).toEqual([
        'https://signed/trips/10/plan-images/a.jpg',
      ]);
    });
  });

  describe('deletePlanItem image cleanup', () => {
    it('deletes stored image objects alongside the voice recording', async () => {
      const tripId = 10;
      const itemId = 42;
      prisma.tripMember.findUnique.mockResolvedValue({
        tripId,
        userId: 1,
        inviteStatus: InviteStatus.ACCEPTED,
      });
      prisma.tripPlanItem.findUnique.mockResolvedValue({
        id: itemId,
        title: 'With media',
        tripId,
        voiceUrl: 'trips/10/voice/v.m4a',
        imageUrls: ['trips/10/plan-images/a.jpg', 'trips/10/plan-images/b.jpg'],
      });
      prisma.tripPlanItem.delete = jest.fn().mockResolvedValue({});

      await service.deletePlanItem(tripId, itemId, 1);

      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'trips/10/voice/v.m4a',
      );
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'trips/10/plan-images/a.jpg',
      );
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'trips/10/plan-images/b.jpg',
      );
    });
  });
});
