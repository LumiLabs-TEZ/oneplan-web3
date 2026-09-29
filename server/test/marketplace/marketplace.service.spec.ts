import { ConfigService } from '@nestjs/config';
import { MarketplaceService } from '../../src/marketplace/marketplace.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';
import { TripActivityService } from '../../src/trip-activity/trip-activity.service';
import { TripsService } from '../../src/trips/trips.service';
import { NotificationsService } from '../../src/notifications/notifications.service';

describe('MarketplaceService media URL resolution', () => {
  let service: MarketplaceService;
  let prisma: Record<string, any>;
  let storageService: Record<string, any>;

  beforeEach(() => {
    prisma = {
      marketplaceListing: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      marketplaceRating: {
        aggregate: jest.fn().mockResolvedValue({
          _avg: { rating: null },
          _count: { _all: 0 },
        }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    storageService = {
      getSignedThumbUrl: jest.fn(async (objectKey: string) => ({
        url: `https://signed.example.com/${encodeURIComponent(objectKey)}`,
      })),
      extractObjectKey: jest.fn((value: string) => value),
    };

    service = new MarketplaceService(
      prisma as unknown as PrismaService,
      storageService as unknown as StorageService,
      { log: jest.fn() } as unknown as TripActivityService,
      { findTripDetail: jest.fn() } as unknown as TripsService,
      {
        get: jest.fn((_k: string, d?: unknown) => d ?? 30),
      } as unknown as ConfigService,
      undefined as any, // purchaseVerifier (unused)
      {
        sendListingStatusPush: jest.fn().mockResolvedValue(undefined),
      } as unknown as NotificationsService,
      undefined as any, // acquisition (unused)
      undefined as any, // missions (unused)
      { get: jest.fn().mockReturnValue(null) } as any, // cls
    );
  });

  it('signs object keys for cover and item images while passing absolute URLs through', async () => {
    const listing = {
      id: 7,
      createdById: 10,
      createdBy: { displayName: 'Ken', avatarUrl: null },
      name: 'Da Lat Plan',
      description: 'desc',
      coverImageUrl: 'marketplace/7/images/cover.jpg',
      city: { name: 'Da Lat' },
      state: null,
      country: { name: 'Vietnam' },
      price: { toString: () => '39000' },
      durationDays: 3,
      tag: 'friends',
      status: 'APPROVED',
      deletedAt: null,
      createdAt: new Date('2026-03-27T00:00:00.000Z'),
      updatedAt: new Date('2026-03-27T00:00:00.000Z'),
      _count: { acquisitions: 0 },
      items: [
        {
          id: 70,
          listingId: 7,
          dayNumber: 1,
          title: 'Breakfast',
          description: null,
          location: 'Da Lat',
          startTime: '08:00',
          category: null,
          imageUrls: [
            'marketplace/7/images/item-1.jpg',
            'https://cdn.example.com/item-2.jpg',
          ],
          sortOrder: 0,
          createdAt: new Date('2026-03-27T00:00:00.000Z'),
        },
      ],
    };

    prisma.marketplaceListing.findUnique.mockResolvedValue(listing);

    const result = await service.getListing(7);

    expect(result.creatorName).toBe('Ken');
    expect(result.creatorAvatarUrl).toBeNull();
    expect(result.coverImageUrl).toContain(
      encodeURIComponent('marketplace/7/images/cover.jpg'),
    );
    expect(result.items[0].imageUrls[0]).toContain(
      encodeURIComponent('marketplace/7/images/item-1.jpg'),
    );
    expect(result.items[0].imageUrls[1]).toBe(
      'https://cdn.example.com/item-2.jpg',
    );

    expect(storageService.getSignedThumbUrl).toHaveBeenCalledWith(
      'marketplace/7/images/cover.jpg',
    );
    expect(storageService.getSignedThumbUrl).toHaveBeenCalledWith(
      'marketplace/7/images/item-1.jpg',
    );
    expect(storageService.getSignedThumbUrl).toHaveBeenCalledTimes(2);
  });

  it('keeps absolute cover URL untouched in listMyListings', async () => {
    prisma.marketplaceListing.findMany.mockResolvedValue([
      {
        id: 8,
        createdById: 10,
        createdBy: { displayName: 'Ken', avatarUrl: null },
        name: 'Budget Plan',
        description: null,
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
        city: null,
        state: null,
        country: null,
        price: { toString: () => '29000' },
        durationDays: 2,
        tag: null,
        createdAt: new Date('2026-03-27T00:00:00.000Z'),
        updatedAt: new Date('2026-03-27T00:00:00.000Z'),
        _count: { acquisitions: 0 },
        items: [
          {
            id: 80,
            listingId: 8,
            dayNumber: 1,
            title: 'Walk',
            description: null,
            location: null,
            startTime: null,
            category: null,
            imageUrls: ['marketplace/8/images/item.jpg'],
            sortOrder: 0,
            createdAt: new Date('2026-03-27T00:00:00.000Z'),
          },
        ],
      },
    ]);

    const results = await service.listMyListings(10);

    expect(results[0].creatorName).toBe('Ken');
    expect(results[0].creatorAvatarUrl).toBeNull();
    expect(results[0].coverImageUrl).toBe('https://cdn.example.com/cover.jpg');
    expect(results[0].items[0].imageUrls[0]).toContain(
      encodeURIComponent('marketplace/8/images/item.jpg'),
    );
    expect(storageService.getSignedThumbUrl).toHaveBeenCalledTimes(1);
  });
});
