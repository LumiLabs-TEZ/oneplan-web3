import { MarketplaceListingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  listingContentUpdatedAt,
  MarketplaceAcquisitionService,
} from './marketplace-acquisition.service';

describe('MarketplaceAcquisitionService', () => {
  let service: MarketplaceAcquisitionService;
  let prisma: any;

  const approvedListing = (overrides: any = {}) => ({
    id: 1,
    publicId: 'pub_abc123',
    createdById: 5,
    name: 'Da Lat Trip',
    description: 'desc',
    coverImageUrl: 'cover.jpg',
    status: MarketplaceListingStatus.APPROVED,
    deletedAt: null,
    sourceLocale: 'vi',
    cityId: 42,
    stateId: 10,
    countryId: 7,
    price: 1000,
    currency: 'VND',
    durationDays: 3,
    tags: [],
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: { displayName: 'Creator', avatarUrl: 'avatar.jpg' },
    translations: [],
    items: [
      {
        id: 100,
        dayNumber: 1,
        title: 'Coffee',
        description: null,
        location: null,
        latitude: null,
        longitude: null,
        address: null,
        startTime: '08:00',
        category: null,
        imageUrls: [],
        sortOrder: 0,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        translations: [],
      },
    ],
    ...overrides,
  });

  const acquisition = (overrides: any = {}) => ({
    id: 10,
    acquiredAt: new Date('2026-01-01T00:00:00.000Z'),
    snapshotSourceUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      marketplaceListing: { findUnique: jest.fn() },
      marketplaceAcquisition: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      acquisitionItem: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      marketplacePayment: { create: jest.fn() },
    };
    service = new MarketplaceAcquisitionService(prisma as PrismaService);
  });

  describe('listingContentUpdatedAt', () => {
    it('returns the newest timestamp across listing, items and translations', () => {
      const listing = approvedListing({
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        translations: [
          {
            locale: 'en',
            name: 'x',
            description: null,
            updatedAt: new Date('2026-03-01T00:00:00.000Z'),
          },
        ],
        items: [
          {
            ...approvedListing().items[0],
            updatedAt: new Date('2026-02-01T00:00:00.000Z'),
            translations: [
              {
                locale: 'en',
                title: 'x',
                description: null,
                updatedAt: new Date('2026-04-01T00:00:00.000Z'),
              },
            ],
          },
        ],
      });

      expect(listingContentUpdatedAt(listing).toISOString()).toBe(
        new Date('2026-04-01T00:00:00.000Z').toISOString(),
      );
    });
  });

  describe('findApprovedListingForAcquisition', () => {
    it('returns null for missing, deleted or non-approved listings', async () => {
      prisma.marketplaceListing.findUnique.mockResolvedValue(null);
      await expect(
        service.findApprovedListingForAcquisition(1),
      ).resolves.toBeNull();

      prisma.marketplaceListing.findUnique.mockResolvedValue(
        approvedListing({ deletedAt: new Date() }),
      );
      await expect(
        service.findApprovedListingForAcquisition(1),
      ).resolves.toBeNull();

      prisma.marketplaceListing.findUnique.mockResolvedValue(
        approvedListing({ status: MarketplaceListingStatus.PENDING_REVIEW }),
      );
      await expect(
        service.findApprovedListingForAcquisition(1),
      ).resolves.toBeNull();
    });

    it('returns the listing when approved', async () => {
      const listing = approvedListing();
      prisma.marketplaceListing.findUnique.mockResolvedValue(listing);
      await expect(service.findApprovedListingForAcquisition(1)).resolves.toBe(
        listing,
      );
    });
  });

  describe('refreshAcquisitionSnapshotIfStale', () => {
    it('does nothing when the listing content is not newer', async () => {
      const listing = approvedListing({
        updatedAt: new Date('2025-12-01T00:00:00.000Z'),
        items: [
          {
            ...approvedListing().items[0],
            updatedAt: new Date('2025-12-01T00:00:00.000Z'),
          },
        ],
      });

      const refreshed = await service.refreshAcquisitionSnapshotIfStale(
        prisma,
        acquisition(),
        listing,
      );

      expect(refreshed).toBe(false);
      expect(prisma.marketplaceAcquisition.updateMany).not.toHaveBeenCalled();
      expect(prisma.acquisitionItem.deleteMany).not.toHaveBeenCalled();
    });

    it('rebuilds the snapshot fields and items when stale', async () => {
      const version = new Date('2026-04-01T00:00:00.000Z');
      const listing = approvedListing({
        updatedAt: version,
        items: [
          {
            ...approvedListing().items[0],
            id: 200,
            title: 'New item',
            updatedAt: version,
          },
        ],
      });
      prisma.marketplaceAcquisition.updateMany.mockResolvedValue({ count: 1 });

      const refreshed = await service.refreshAcquisitionSnapshotIfStale(
        prisma,
        acquisition(),
        listing,
      );

      expect(refreshed).toBe(true);
      expect(prisma.marketplaceAcquisition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 10,
            OR: [
              { snapshotSourceUpdatedAt: null },
              { snapshotSourceUpdatedAt: { lt: version } },
            ],
          },
          data: expect.objectContaining({
            snapshotName: 'Da Lat Trip',
            snapshotPrice: 1000,
            snapshotSourceUpdatedAt: version,
          }),
        }),
      );
      expect(prisma.acquisitionItem.deleteMany).toHaveBeenCalledWith({
        where: { acquisitionId: 10 },
      });
      expect(prisma.acquisitionItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            acquisitionId: 10,
            title: 'New item',
          }),
        ],
      });
    });

    it('does not replace items when the claim is lost to a concurrent refresh', async () => {
      const listing = approvedListing({
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
        items: [
          {
            ...approvedListing().items[0],
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ],
      });
      prisma.marketplaceAcquisition.updateMany.mockResolvedValue({ count: 0 });

      const refreshed = await service.refreshAcquisitionSnapshotIfStale(
        prisma,
        acquisition(),
        listing,
      );

      expect(refreshed).toBe(false);
      expect(prisma.acquisitionItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.acquisitionItem.createMany).not.toHaveBeenCalled();
    });

    it('falls back to acquiredAt when the source version is null', async () => {
      const listing = approvedListing({
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
        items: [
          {
            ...approvedListing().items[0],
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ],
      });
      prisma.marketplaceAcquisition.updateMany.mockResolvedValue({ count: 1 });

      const refreshed = await service.refreshAcquisitionSnapshotIfStale(
        prisma,
        acquisition({ snapshotSourceUpdatedAt: null }),
        listing,
      );

      expect(refreshed).toBe(true);
      expect(prisma.marketplaceAcquisition.updateMany).toHaveBeenCalled();
    });
  });

  describe('createAcquisitionSnapshot', () => {
    it('records the listing content version on creation', async () => {
      const version = new Date('2026-04-01T00:00:00.000Z');
      const listing = approvedListing({ updatedAt: version });
      prisma.marketplaceAcquisition.create.mockResolvedValue({ id: 10 });

      await service.createAcquisitionSnapshot(prisma, 77, 1, listing);

      expect(prisma.marketplaceAcquisition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 77,
          listingId: 1,
          snapshotName: 'Da Lat Trip',
          snapshotSourceUpdatedAt: version,
        }),
      });
      expect(prisma.acquisitionItem.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ acquisitionId: 10, title: 'Coffee' })],
      });
    });
  });
});
