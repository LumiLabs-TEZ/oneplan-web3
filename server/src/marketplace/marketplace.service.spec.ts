import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActivityAction,
  ContentLocale,
  Currency,
  InviteStatus,
  MarketplaceListingStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { TripsService } from '../trips/trips.service';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceAcquisitionService } from './acquisition/marketplace-acquisition.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MarketplaceFeedMatchedScope } from './dto/marketplace-feed-matched-scope.enum';
import { MarketplaceFeedTab } from './dto/marketplace-feed-tab.enum';
import { SortDirection } from './dto/sort-direction.enum';

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let clsMock: { get: jest.Mock };
  let missions: Record<string, jest.Mock>;
  let prisma: any;
  let storageService: Pick<
    StorageService,
    'getSignedThumbUrl' | 'extractObjectKey'
  >;
  let activityService: Pick<TripActivityService, 'log'>;
  let tripsService: Pick<TripsService, 'findTripDetail'>;
  let configService: Pick<ConfigService, 'get'>;
  let purchaseVerifier: { verifyGooglePlayPurchase: jest.Mock };
  let notificationsService: Pick<NotificationsService, 'sendListingStatusPush'>;

  const arrangeFeedCalls = (opts: {
    candidatesByLevel?: {
      none?: any[];
      city?: any[];
      state?: any[];
      country?: any[];
    };
    fullListings?: any[];
    destinationRows?: any[];
    featuredListings?: any[];
  }) => {
    const {
      candidatesByLevel = {},
      fullListings = [],
      destinationRows = [],
      featuredListings = [],
    } = opts;

    (prisma.marketplaceListing.findMany as jest.Mock).mockImplementation(
      (args: any) => {
        const where = args?.where ?? {};

        // Global destinationNames query: selects city/state/country with the
        // public filter (status + deletedAt) and no id/location clause.
        if (
          args?.select?.city &&
          args?.select?.state &&
          args?.select?.country &&
          where.cityId === undefined &&
          where.stateId === undefined &&
          where.countryId === undefined &&
          where.id === undefined
        ) {
          return Promise.resolve(destinationRows);
        }
        // Featured fetch (admin-curated, global): keyed by featuredAt clause.
        if (where.featuredAt !== undefined) {
          return Promise.resolve(featuredListings);
        }
        // Full-listing fetch by id
        if (args?.include && where?.id?.in) {
          const ids: number[] = where.id.in;
          const map = new Map<number, any>(fullListings.map((l) => [l.id, l]));
          return Promise.resolve(ids.map((id) => map.get(id)).filter(Boolean));
        }
        // Candidate queries routed by destination clause.
        if (where.cityId !== undefined) {
          return Promise.resolve(candidatesByLevel.city ?? []);
        }
        if (where.stateId !== undefined) {
          return Promise.resolve(candidatesByLevel.state ?? []);
        }
        if (where.countryId !== undefined) {
          return Promise.resolve(candidatesByLevel.country ?? []);
        }
        return Promise.resolve(candidatesByLevel.none ?? []);
      },
    );
  };

  beforeEach(() => {
    prisma = {
      marketplaceListing: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      marketplaceAcquisition: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      acquisitionItem: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      marketplacePayment: {
        create: jest.fn(),
      },
      marketplaceListingTranslation: { deleteMany: jest.fn() },
      tripPlanMarketItemTranslation: { deleteMany: jest.fn() },
      marketplaceRating: {
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } }),
      },
      city: { findMany: jest.fn().mockResolvedValue([]) },
      state: { findMany: jest.fn().mockResolvedValue([]) },
      country: { findMany: jest.fn().mockResolvedValue([]) },
      trip: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      tripMember: { create: jest.fn() },
      tripPlanItem: { create: jest.fn() },
      tripPlanItemMember: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));

    storageService = {
      getSignedThumbUrl: jest
        .fn()
        .mockResolvedValue({ url: 'https://signed.example.com/placeholder' }),
      extractObjectKey: jest.fn((value: string) => value),
    };
    activityService = { log: jest.fn() };
    tripsService = { findTripDetail: jest.fn() };
    configService = {
      get: jest.fn(
        (_key: string, defaultValue?: unknown) => defaultValue ?? 30,
      ),
    };
    purchaseVerifier = {
      verifyGooglePlayPurchase: jest.fn(),
    };
    notificationsService = {
      sendListingStatusPush: jest.fn().mockResolvedValue(undefined),
    };

    clsMock = { get: jest.fn().mockReturnValue(null) };
    missions = {
      onListingApproved: jest.fn(),
      onListingRated: jest.fn(),
      onTripCreated: jest.fn(),
      onPlanApplied: jest.fn(),
    };
    service = new (MarketplaceService as any)(
      prisma as PrismaService,
      storageService as StorageService,
      activityService as TripActivityService,
      tripsService as TripsService,
      configService as ConfigService,
      purchaseVerifier,
      notificationsService as NotificationsService,
      // Real acquisition service over the same prisma mock — the snapshot
      // logic under test lives there now.
      new MarketplaceAcquisitionService(prisma as PrismaService),
      missions as any,
      clsMock,
    );
  });

  // ── listMarketplaceFeed ────────────────────────────────────────────

  const buildListing = (overrides: Partial<any>) => ({
    id: 0,
    name: 'Listing',
    createdBy: { displayName: 'Creator', avatarUrl: null },
    coverImageUrl: null,
    price: new Prisma.Decimal('1000000'),
    currency: Currency.VND,
    tags: [],
    city: null,
    state: null,
    country: null,
    durationDays: 3,
    createdAt: new Date('2026-03-27T00:00:00.000Z'),
    _count: { acquisitions: 0, items: 0 },
    ...overrides,
  });

  const candidateOf = (id: number, priceText: string, createdAt: Date) => ({
    id,
    price: new Prisma.Decimal(priceText),
    createdAt,
  });

  it('feed filters on APPROVED + deletedAt=null', async () => {
    arrangeFeedCalls({
      candidatesByLevel: { none: [candidateOf(1, '1000', new Date())] },
      fullListings: [buildListing({ id: 1 })],
    });

    await service.listMarketplaceFeed({});

    const candidateWhere = (
      prisma.marketplaceListing.findMany as jest.Mock
    ).mock.calls
      .map((c) => c[0]?.where)
      .find((w: any) => w && w.status === MarketplaceListingStatus.APPROVED);
    expect(candidateWhere).toBeDefined();
    expect(candidateWhere.status).toBe(MarketplaceListingStatus.APPROVED);
    expect(candidateWhere.deletedAt).toBeNull();
  });

  it('cascade CITY returns listings with scope=CITY', async () => {
    arrangeFeedCalls({
      candidatesByLevel: { city: [candidateOf(10, '500', new Date())] },
      fullListings: [buildListing({ id: 10 })],
    });

    const result = await service.listMarketplaceFeed({ cityId: 77 });

    expect(result.matchedDestinationScope).toBe(
      MarketplaceFeedMatchedScope.CITY,
    );
    expect(result.items.map((i) => i.id)).toEqual([10]);
  });

  it('cascade NONE: items=[], scope=NONE, destinationNames populated', async () => {
    arrangeFeedCalls({
      candidatesByLevel: { city: [], state: [], country: [] },
      destinationRows: [
        { city: { name: 'Da Lat' }, state: null, country: null },
      ],
    });

    const result = await service.listMarketplaceFeed({
      cityId: 1,
      stateId: 2,
      countryId: 3,
    });
    expect(result.matchedDestinationScope).toBe(
      MarketplaceFeedMatchedScope.NONE,
    );
    expect(result.items).toEqual([]);
    expect(result.destinationNames).toEqual(['Da Lat']);
  });

  it('budgetSort ASC overrides tab', async () => {
    const t = new Date();
    arrangeFeedCalls({
      candidatesByLevel: {
        none: [
          candidateOf(501, '3000', t),
          candidateOf(502, '1000', t),
          candidateOf(503, '2000', t),
        ],
      },
      fullListings: [
        buildListing({ id: 501 }),
        buildListing({ id: 502 }),
        buildListing({ id: 503 }),
      ],
    });

    const result = await service.listMarketplaceFeed({
      tab: MarketplaceFeedTab.TOP_RATED,
      budgetSort: SortDirection.ASC,
    });

    expect(result.items.map((i) => i.id)).toEqual([502, 503, 501]);
  });

  // ── Feed language filtering ────────────────────────────────────────

  describe('feed language filtering', () => {
    const enClause = {
      OR: [
        { sourceLocale: ContentLocale.en },
        { translations: { some: { locale: ContentLocale.en } } },
      ],
    };

    it('filters candidates to the request locale (source or translation)', async () => {
      clsMock.get.mockReturnValue(ContentLocale.en);
      arrangeFeedCalls({
        candidatesByLevel: { none: [candidateOf(1, '1000', new Date())] },
        fullListings: [buildListing({ id: 1 })],
      });

      await service.listMarketplaceFeed({});

      const candidateCall = (
        prisma.marketplaceListing.findMany as jest.Mock
      ).mock.calls.find((c) => c[0]?.select?.price !== undefined);
      expect(candidateCall[0].where).toEqual(expect.objectContaining(enClause));
    });

    it('does not filter when the request has no supported locale', async () => {
      clsMock.get.mockReturnValue(null);
      arrangeFeedCalls({
        candidatesByLevel: { none: [candidateOf(1, '1000', new Date())] },
        fullListings: [buildListing({ id: 1 })],
      });

      await service.listMarketplaceFeed({});

      const candidateCall = (
        prisma.marketplaceListing.findMany as jest.Mock
      ).mock.calls.find((c) => c[0]?.select?.price !== undefined);
      expect(candidateCall[0].where).not.toHaveProperty('OR');
    });

    it('falls back to every language when the localized feed would be empty', async () => {
      clsMock.get.mockReturnValue(ContentLocale.en);

      const candidateWheres: any[] = [];
      (prisma.marketplaceListing.findMany as jest.Mock).mockImplementation(
        (args: any) => {
          const where = args?.where ?? {};
          if (args?.select?.price !== undefined) {
            candidateWheres.push(where);
            // First pass (localized) finds nothing; the unfiltered retry wins.
            return Promise.resolve(
              candidateWheres.length === 1
                ? []
                : [candidateOf(1, '1000', new Date())],
            );
          }
          if (args?.include && where?.id?.in) {
            return Promise.resolve([buildListing({ id: 1 })]);
          }
          return Promise.resolve([]);
        },
      );

      const result = await service.listMarketplaceFeed({});

      expect(candidateWheres).toHaveLength(2);
      expect(candidateWheres[0]).toEqual(expect.objectContaining(enClause));
      expect(candidateWheres[1]).not.toHaveProperty('OR');
      expect(result.items.map((i) => i.id)).toEqual([1]);
    });

    it('falls back to every language per destination scope', async () => {
      clsMock.get.mockReturnValue(ContentLocale.vi);

      const cityWheres: any[] = [];
      (prisma.marketplaceListing.findMany as jest.Mock).mockImplementation(
        (args: any) => {
          const where = args?.where ?? {};
          if (args?.select?.price !== undefined && where.cityId !== undefined) {
            cityWheres.push(where);
            return Promise.resolve(
              cityWheres.length === 1
                ? []
                : [candidateOf(9, '900', new Date())],
            );
          }
          if (args?.select?.price !== undefined) return Promise.resolve([]);
          if (args?.include && where?.id?.in) {
            return Promise.resolve([buildListing({ id: 9 })]);
          }
          return Promise.resolve([]);
        },
      );

      const result = await service.listMarketplaceFeed({ cityId: 77 });

      expect(cityWheres).toHaveLength(2);
      expect(result.matchedDestinationScope).toBe(
        MarketplaceFeedMatchedScope.CITY,
      );
      expect(result.items.map((i) => i.id)).toEqual([9]);
    });

    it('localizes featured and falls back when no featured matches', async () => {
      clsMock.get.mockReturnValue(ContentLocale.en);

      const featuredWheres: any[] = [];
      (prisma.marketplaceListing.findMany as jest.Mock).mockImplementation(
        (args: any) => {
          const where = args?.where ?? {};
          if (where.featuredAt !== undefined) {
            featuredWheres.push(where);
            return Promise.resolve(
              featuredWheres.length === 1
                ? []
                : [
                    buildListing({
                      id: 7,
                      createdById: 99,
                      sourceLocale: ContentLocale.en,
                      translations: [],
                    }),
                  ],
            );
          }
          if (args?.select?.price !== undefined) return Promise.resolve([]);
          return Promise.resolve([]);
        },
      );

      const result = await service.listMarketplaceFeed({});

      expect(featuredWheres).toHaveLength(2);
      expect(featuredWheres[0]).toEqual(expect.objectContaining(enClause));
      expect(featuredWheres[1]).not.toHaveProperty('OR');
      expect(result.featured.map((f) => f.id)).toEqual([7]);
    });
  });

  // ── applyForListing ────────────────────────────────────────────────

  const approvedListing = (overrides: Partial<any> = {}) => ({
    id: 1,
    publicId: 'pub_abc123',
    createdById: 5,
    name: 'Da Lat Trip',
    description: 'desc',
    coverImageUrl: 'cover.jpg',
    cityId: 42,
    stateId: 10,
    countryId: 7,
    price: new Prisma.Decimal('1000000'),
    currency: Currency.VND,
    durationDays: 3,
    tags: [],
    status: MarketplaceListingStatus.APPROVED,
    deletedAt: null,
    createdBy: { displayName: 'Creator', avatarUrl: 'avatar.jpg' },
    city: null,
    state: null,
    country: null,
    createdAt: new Date('2026-03-27T00:00:00.000Z'),
    updatedAt: new Date('2026-03-27T00:00:00.000Z'),
    _count: { acquisitions: 0 },
    playProductId: null,
    translations: [],
    items: [
      {
        id: 100,
        listingId: 1,
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
        createdAt: new Date('2026-03-27T00:00:00.000Z'),
        updatedAt: new Date('2026-03-27T00:00:00.000Z'),
        translations: [],
      },
    ],
    ...overrides,
  });

  it('applyForListing writes snapshot + items in a transaction', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      approvedListing(),
    );
    (prisma.marketplaceAcquisition.create as jest.Mock).mockResolvedValue({
      id: 10,
      userId: 5,
      listingId: 1,
      acquiredAt: new Date('2026-03-28T12:00:00.000Z'),
    });

    const result = await service.applyForListing(5, 1);

    const createArgs = (prisma.marketplaceAcquisition.create as jest.Mock).mock
      .calls[0][0];
    expect(createArgs.data).toMatchObject({
      userId: 5,
      listingId: 1,
      snapshotName: 'Da Lat Trip',
      snapshotPrice: expect.anything(),
      snapshotCurrency: Currency.VND,
      snapshotDurationDays: 3,
      snapshotCityId: 42,
      snapshotCreatorName: 'Creator',
      snapshotCreatorAvatarUrl: 'avatar.jpg',
    });
    const itemArgs = (prisma.acquisitionItem.createMany as jest.Mock).mock
      .calls[0][0];
    expect(itemArgs.data).toHaveLength(1);
    expect(itemArgs.data[0]).toMatchObject({
      acquisitionId: 10,
      title: 'Coffee',
      dayNumber: 1,
    });
    expect(result.id).toBe(10);
  });

  it('purchaseListing writes snapshot + payment in a transaction', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      approvedListing({ playProductId: 'marketplace.dalat.3d2n' }),
    );
    purchaseVerifier.verifyGooglePlayPurchase.mockResolvedValue({
      packageName: 'com.oneplan.app',
      productId: 'marketplace.dalat.3d2n',
      purchaseToken: 'purchase-token',
      orderId: 'GPA.1234-5678-9012-34567',
      purchaseTime: new Date('2026-03-28T12:00:00.000Z'),
    });
    (prisma.marketplaceAcquisition.create as jest.Mock).mockResolvedValue({
      id: 10,
      userId: 5,
      listingId: 1,
      acquiredAt: new Date('2026-03-28T12:00:00.000Z'),
    });
    (prisma.marketplacePayment.create as jest.Mock).mockResolvedValue({
      id: 99,
    });

    const result = await (service as any).purchaseListing(5, 1, {
      packageName: 'com.oneplan.app',
      productId: 'marketplace.dalat.3d2n',
      purchaseToken: 'purchase-token',
    });

    expect(purchaseVerifier.verifyGooglePlayPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        playProductId: 'marketplace.dalat.3d2n',
      }),
      {
        packageName: 'com.oneplan.app',
        productId: 'marketplace.dalat.3d2n',
        purchaseToken: 'purchase-token',
      },
    );
    const paymentArgs = (prisma.marketplacePayment.create as jest.Mock).mock
      .calls[0][0];
    expect(paymentArgs.data).toMatchObject({
      acquisitionId: 10,
      amount: expect.anything(),
      currency: Currency.VND,
      transactionId: 'GPA.1234-5678-9012-34567',
      paidAt: new Date('2026-03-28T12:00:00.000Z'),
    });
    expect(result.id).toBe(10);
  });

  it('purchaseListing rejects listings without playProductId', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      approvedListing({ playProductId: null }),
    );

    await expect(
      (service as any).purchaseListing(5, 1, {
        packageName: 'com.oneplan.app',
        productId: 'marketplace.dalat.3d2n',
        purchaseToken: 'purchase-token',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(purchaseVerifier.verifyGooglePlayPurchase).not.toHaveBeenCalled();
  });

  it('applyForListing throws NotFound when listing missing', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.applyForListing(5, 999)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('applyForListing throws NotFound when listing is not APPROVED', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      approvedListing({ status: MarketplaceListingStatus.PENDING_REVIEW }),
    );
    await expect(service.applyForListing(5, 1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('applyForListing throws NotFound when listing is soft-deleted', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      approvedListing({ deletedAt: new Date() }),
    );
    await expect(service.applyForListing(5, 1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('applyForListing throws Conflict on duplicate', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      approvedListing(),
    );
    (prisma.marketplaceAcquisition.create as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
      }),
    );
    await expect(service.applyForListing(5, 1)).rejects.toThrow(
      ConflictException,
    );
  });

  it('purchaseListing throws Conflict on duplicate', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      approvedListing({ playProductId: 'marketplace.dalat.3d2n' }),
    );
    purchaseVerifier.verifyGooglePlayPurchase.mockResolvedValue({
      packageName: 'com.oneplan.app',
      productId: 'marketplace.dalat.3d2n',
      purchaseToken: 'purchase-token',
      orderId: 'GPA.1234-5678-9012-34567',
      purchaseTime: new Date('2026-03-28T12:00:00.000Z'),
    });
    (prisma.marketplaceAcquisition.create as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
      }),
    );

    await expect(
      (service as any).purchaseListing(5, 1, {
        packageName: 'com.oneplan.app',
        productId: 'marketplace.dalat.3d2n',
        purchaseToken: 'purchase-token',
      }),
    ).rejects.toThrow(ConflictException);
  });

  // ── getAppliedStatus ───────────────────────────────────────────────

  it('getAppliedStatus returns acquisitionId for existing acquisition', async () => {
    (prisma.marketplaceAcquisition.findUnique as jest.Mock).mockResolvedValue({
      id: 77,
      acquiredAt: new Date('2026-03-28T12:00:00.000Z'),
    });

    expect(await service.getAppliedStatus(5, 1)).toEqual({
      applied: true,
      acquisitionId: 77,
      acquiredAt: '2026-03-28T12:00:00.000Z',
    });
  });

  it('getAppliedStatus returns applied=false for missing acquisition', async () => {
    (prisma.marketplaceAcquisition.findUnique as jest.Mock).mockResolvedValue(
      null,
    );
    expect(await service.getAppliedStatus(5, 2)).toEqual({
      applied: false,
      acquisitionId: null,
      acquiredAt: null,
    });
  });

  // ── listMyAcquisitions ─────────────────────────────────────────────

  it('listMyAcquisitions returns snapshots even when listing is REJECTED', async () => {
    (prisma.marketplaceAcquisition.findMany as jest.Mock).mockResolvedValue([
      {
        id: 10,
        listingId: 1,
        snapshotName: 'Old Name',
        snapshotDescription: null,
        snapshotCoverImageUrl: null,
        snapshotPrice: new Prisma.Decimal('1000'),
        snapshotCurrency: Currency.VND,
        snapshotDurationDays: 2,
        snapshotTags: [],
        snapshotCityId: null,
        snapshotStateId: null,
        snapshotCountryId: null,
        snapshotCreatorName: 'Creator',
        snapshotCreatorAvatarUrl: null,
        acquiredAt: new Date('2026-03-28T12:00:00.000Z'),
        listing: {
          status: MarketplaceListingStatus.REJECTED,
          deletedAt: null,
        },
        _count: { items: 3 },
      },
    ]);

    const result = await service.listMyAcquisitions(5);
    expect(result).toHaveLength(1);
    expect(result[0].listingStillAvailable).toBe(false);
    expect(result[0].name).toBe('Old Name');
    expect(result[0].activityCount).toBe(3);
  });

  it('listMyAcquisitions marks listingStillAvailable=true only when APPROVED + not deleted', async () => {
    (prisma.marketplaceAcquisition.findMany as jest.Mock).mockResolvedValue([
      {
        id: 11,
        listingId: 2,
        snapshotName: 'Live',
        snapshotDescription: null,
        snapshotCoverImageUrl: null,
        snapshotPrice: new Prisma.Decimal('2000'),
        snapshotCurrency: Currency.VND,
        snapshotDurationDays: 2,
        snapshotTags: [],
        snapshotCityId: null,
        snapshotStateId: null,
        snapshotCountryId: null,
        snapshotCreatorName: 'Creator',
        snapshotCreatorAvatarUrl: null,
        acquiredAt: new Date(),
        listing: {
          status: MarketplaceListingStatus.APPROVED,
          deletedAt: null,
        },
        _count: { items: 1 },
      },
    ]);

    const result = await service.listMyAcquisitions(5);
    expect(result[0].listingStillAvailable).toBe(true);
  });

  // ── updateListing status flip ──────────────────────────────────────

  it('updateListing flips APPROVED → PENDING_REVIEW', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({
      createdById: 5,
      deletedAt: null,
    });
    (
      prisma.marketplaceListing.findUniqueOrThrow as jest.Mock
    ).mockResolvedValue({
      status: MarketplaceListingStatus.APPROVED,
    });
    (prisma.marketplaceListing.update as jest.Mock).mockResolvedValue({
      id: 1,
      createdById: 5,
      status: MarketplaceListingStatus.PENDING_REVIEW,
      createdBy: { displayName: 'x', avatarUrl: null },
      name: 'n',
      description: null,
      coverImageUrl: null,
      city: null,
      state: null,
      country: null,
      price: new Prisma.Decimal('1'),
      currency: Currency.VND,
      durationDays: 1,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
      _count: { acquisitions: 0 },
    });

    await service.updateListing(1, 5, { name: 'new name' });

    const updateArgs = (prisma.marketplaceListing.update as jest.Mock).mock
      .calls[0][0];
    expect(updateArgs.data.status).toBe(
      MarketplaceListingStatus.PENDING_REVIEW,
    );
  });

  it('updateListing does not flip when already PENDING_REVIEW', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({
      createdById: 5,
      deletedAt: null,
    });
    (
      prisma.marketplaceListing.findUniqueOrThrow as jest.Mock
    ).mockResolvedValue({
      status: MarketplaceListingStatus.PENDING_REVIEW,
    });
    (prisma.marketplaceListing.update as jest.Mock).mockResolvedValue({
      id: 1,
      createdById: 5,
      status: MarketplaceListingStatus.PENDING_REVIEW,
      createdBy: { displayName: 'x', avatarUrl: null },
      name: 'n',
      description: null,
      coverImageUrl: null,
      city: null,
      state: null,
      country: null,
      price: new Prisma.Decimal('1'),
      currency: Currency.VND,
      durationDays: 1,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
      _count: { acquisitions: 0 },
    });

    await service.updateListing(1, 5, { name: 'tweak' });

    const updateArgs = (prisma.marketplaceListing.update as jest.Mock).mock
      .calls[0][0];
    expect(updateArgs.data.status).toBeUndefined();
  });

  it('updateListing writes playProductId changes', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({
      createdById: 5,
      deletedAt: null,
    });
    (
      prisma.marketplaceListing.findUniqueOrThrow as jest.Mock
    ).mockResolvedValue({
      status: MarketplaceListingStatus.PENDING_REVIEW,
    });
    (prisma.marketplaceListing.update as jest.Mock).mockResolvedValue(
      approvedListing({ playProductId: 'marketplace.sapa.2d1n' }),
    );

    await service.updateListing(1, 5, {
      playProductId: 'marketplace.sapa.2d1n',
    } as any);

    const updateArgs = (prisma.marketplaceListing.update as jest.Mock).mock
      .calls[0][0];
    expect(updateArgs.data.playProductId).toBe('marketplace.sapa.2d1n');
  });

  it.each([
    [{}, undefined, undefined],
    [{ cityId: 1, stateId: 2 }, { connect: { id: 1 } }, { connect: { id: 2 } }],
    [
      { cityId: null, stateId: 2 },
      { disconnect: true },
      { connect: { id: 2 } },
    ],
    [
      { cityId: null, stateId: null, countryId: 3 },
      { disconnect: true },
      { disconnect: true },
    ],
  ])(
    'updateListing preserves omission and disconnects explicit null: %j',
    async (body, city, state) => {
      const destinationPrisma = prisma as PrismaService;
      (
        destinationPrisma.marketplaceListing.findUnique as jest.Mock
      ).mockResolvedValue({
        createdById: 5,
        deletedAt: null,
      });
      (
        destinationPrisma.marketplaceListing.findUniqueOrThrow as jest.Mock
      ).mockResolvedValue({ status: MarketplaceListingStatus.PENDING_REVIEW });
      (
        destinationPrisma.marketplaceListing.update as jest.Mock
      ).mockResolvedValue(approvedListing());
      await service.updateListing(1, 5, body);
      const { data } = jest.mocked(destinationPrisma.marketplaceListing.update)
        .mock.calls[0][0];
      expect(data.city).toEqual(city);
      expect(data.state).toEqual(state);
    },
  );

  // ── deleteListing is soft ──────────────────────────────────────────

  it('deleteListing soft-deletes (sets deletedAt)', async () => {
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({
      createdById: 5,
      deletedAt: null,
    });
    (prisma.marketplaceListing.update as jest.Mock).mockResolvedValue({});

    await service.deleteListing(1, 5);

    const updateArgs = (prisma.marketplaceListing.update as jest.Mock).mock
      .calls[0][0];
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
  });

  // ── getListing (publicId + context=edit) ───────────────────────────

  it('getListing resolves a numeric param via id lookup', async () => {
    const listing = approvedListing({ id: 42, publicId: 'opaque-token-1' });
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      listing,
    );

    await service.getListing('42', 999);

    expect(prisma.marketplaceListing.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42 } }),
    );
  });

  it('getListing resolves a non-numeric param via publicId lookup', async () => {
    const listing = approvedListing({ id: 42, publicId: 'opaque-token-1' });
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      listing,
    );

    await service.getListing('opaque-token-1', 999);

    expect(prisma.marketplaceListing.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: 'opaque-token-1' } }),
    );
  });

  it('getListing with context=edit throws NotFound for non-owners', async () => {
    const listing = approvedListing({ createdById: 5 });
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      listing,
    );

    await expect(
      service.getListing('opaque-token-1', 999, 'edit'),
    ).rejects.toThrow(NotFoundException);
  });

  it('getListing with context=edit returns the listing for the owner', async () => {
    const listing = approvedListing({
      createdById: 5,
      playProductId: 'marketplace.dalat.3d2n',
    });
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      listing,
    );

    const result = await service.getListing('opaque-token-1', 5, 'edit');

    expect(result.id).toBe(listing.id);
    expect(result.publicId).toBe(listing.publicId);
    expect((result as any).playProductId).toBe('marketplace.dalat.3d2n');
  });

  it('getListing without context returns approved listing to non-owner', async () => {
    const listing = approvedListing({ createdById: 5 });
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      listing,
    );

    const result = await service.getListing('opaque-token-1', 999);

    expect(result.id).toBe(listing.id);
  });

  it('createListing stores playProductId when provided', async () => {
    (prisma.marketplaceListing.create as jest.Mock).mockResolvedValue(
      approvedListing({ playProductId: 'marketplace.dalat.3d2n' }),
    );

    const result = await service.createListing(5, {
      name: 'Da Lat Trip',
      description: 'desc',
      price: 1000000,
      currency: Currency.VND,
      durationDays: 3,
      tags: [],
      playProductId: 'marketplace.dalat.3d2n',
    } as any);

    const createArgs = (prisma.marketplaceListing.create as jest.Mock).mock
      .calls[0][0];
    expect(createArgs.data.playProductId).toBe('marketplace.dalat.3d2n');
    expect((result as any).playProductId).toBe('marketplace.dalat.3d2n');
  });

  // ── createTripFromListing ──────────────────────────────────────────

  it('createTripFromListing reuses existing acquisition snapshot', async () => {
    const existing = {
      id: 10,
      userId: 77,
      listingId: 1,
      snapshotName: 'Bought Plan',
      snapshotDescription: null,
      snapshotCoverImageUrl: null,
      snapshotPrice: new Prisma.Decimal('1000'),
      snapshotCurrency: Currency.VND,
      snapshotDurationDays: 3,
      snapshotTags: [],
      snapshotCityId: 42,
      snapshotStateId: 10,
      snapshotCountryId: 7,
      snapshotCreatorName: 'Creator',
      snapshotCreatorAvatarUrl: null,
      acquiredAt: new Date('2026-01-01T00:00:00.000Z'),
      snapshotSourceUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      items: [
        {
          id: 500,
          dayNumber: 1,
          title: 'Snapshot item',
          description: null,
          location: null,
          startTime: null,
          category: null,
          imageUrls: [],
          sortOrder: 0,
        },
      ],
    };
    (prisma.marketplaceAcquisition.findUnique as jest.Mock).mockResolvedValue(
      existing,
    );
    // Listing was deleted/rejected after acquisition — keep the frozen copy.
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.trip.create as jest.Mock).mockResolvedValue({ id: 999 });
    (prisma.tripMember.create as jest.Mock).mockResolvedValue({});
    (prisma.tripPlanItem.create as jest.Mock).mockResolvedValue({ id: 5001 });
    (prisma.tripPlanItemMember.create as jest.Mock).mockResolvedValue({});
    (tripsService.findTripDetail as jest.Mock).mockResolvedValue({ id: 999 });

    await service.createTripFromListing(77, 1);

    // Listing is probed for drift, but with nothing approved the snapshot is
    // reused as-is.
    expect(prisma.marketplaceListing.findUnique).toHaveBeenCalled();
    expect(prisma.marketplaceAcquisition.updateMany).not.toHaveBeenCalled();
    expect(prisma.acquisitionItem.deleteMany).not.toHaveBeenCalled();
    expect(prisma.marketplaceAcquisition.create).not.toHaveBeenCalled();
    expect(prisma.tripPlanItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Snapshot item' }),
      }),
    );
    expect(activityService.log).toHaveBeenCalledWith(
      999,
      77,
      ActivityAction.TRIP_CREATED,
      undefined,
      { name: 'Bought Plan' },
    );
    expect(missions.onPlanApplied).toHaveBeenCalledWith(77);
  });

  it('createTripFromListing refreshes a stale snapshot before building the trip', async () => {
    const acquiredAt = new Date('2026-01-01T00:00:00.000Z');
    const existing = {
      id: 10,
      userId: 77,
      listingId: 1,
      snapshotName: 'Old Plan',
      snapshotDescription: null,
      snapshotCoverImageUrl: null,
      snapshotPrice: new Prisma.Decimal('1000'),
      snapshotCurrency: Currency.VND,
      snapshotDurationDays: 3,
      snapshotTags: [],
      snapshotCityId: 42,
      snapshotStateId: 10,
      snapshotCountryId: 7,
      snapshotCreatorName: 'Creator',
      snapshotCreatorAvatarUrl: null,
      acquiredAt,
      snapshotSourceUpdatedAt: acquiredAt,
      items: [
        {
          id: 500,
          dayNumber: 1,
          title: 'Old item',
          description: null,
          location: null,
          startTime: null,
          category: null,
          imageUrls: [],
          sortOrder: 0,
        },
      ],
    };
    const refreshedAt = new Date('2026-04-01T00:00:00.000Z');
    (prisma.marketplaceAcquisition.findUnique as jest.Mock).mockResolvedValue(
      existing,
    );
    (
      prisma.marketplaceAcquisition.findUniqueOrThrow as jest.Mock
    ).mockResolvedValue({
      ...existing,
      snapshotName: 'New Plan',
      snapshotSourceUpdatedAt: refreshedAt,
      items: [
        {
          id: 600,
          dayNumber: 1,
          title: 'New item',
          description: null,
          location: null,
          startTime: null,
          category: null,
          imageUrls: [],
          sortOrder: 0,
        },
      ],
    });
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      approvedListing({
        updatedAt: refreshedAt,
        items: [
          {
            id: 100,
            listingId: 1,
            dayNumber: 1,
            title: 'New item',
            description: null,
            location: null,
            latitude: null,
            longitude: null,
            address: null,
            startTime: null,
            category: null,
            imageUrls: [],
            sortOrder: 0,
            createdAt: acquiredAt,
            updatedAt: refreshedAt,
            translations: [],
          },
        ],
      }),
    );
    (prisma.marketplaceAcquisition.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (prisma.trip.create as jest.Mock).mockResolvedValue({ id: 999 });
    (prisma.tripMember.create as jest.Mock).mockResolvedValue({});
    (prisma.tripPlanItem.create as jest.Mock).mockResolvedValue({ id: 5001 });
    (prisma.tripPlanItemMember.create as jest.Mock).mockResolvedValue({});
    (tripsService.findTripDetail as jest.Mock).mockResolvedValue({ id: 999 });

    await service.createTripFromListing(77, 1);

    expect(prisma.marketplaceAcquisition.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 10 }),
      }),
    );
    expect(prisma.acquisitionItem.deleteMany).toHaveBeenCalledWith({
      where: { acquisitionId: 10 },
    });
    expect(prisma.acquisitionItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ title: 'New item' })],
    });
    expect(prisma.tripPlanItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'New item' }),
      }),
    );
    expect(activityService.log).toHaveBeenCalledWith(
      999,
      77,
      ActivityAction.TRIP_CREATED,
      undefined,
      { name: 'New Plan' },
    );
  });

  it('createTripFromListing keeps the snapshot when the listing is neither newer nor approved', async () => {
    const existing = {
      id: 10,
      userId: 77,
      listingId: 1,
      snapshotName: 'Bought Plan',
      snapshotDescription: null,
      snapshotCoverImageUrl: null,
      snapshotPrice: new Prisma.Decimal('1000'),
      snapshotCurrency: Currency.VND,
      snapshotDurationDays: 3,
      snapshotTags: [],
      snapshotCityId: 42,
      snapshotStateId: 10,
      snapshotCountryId: 7,
      snapshotCreatorName: 'Creator',
      snapshotCreatorAvatarUrl: null,
      acquiredAt: new Date('2026-04-01T00:00:00.000Z'),
      snapshotSourceUpdatedAt: new Date('2026-04-01T00:00:00.000Z'),
      items: [
        {
          id: 500,
          dayNumber: 1,
          title: 'Snapshot item',
          description: null,
          location: null,
          startTime: null,
          category: null,
          imageUrls: [],
          sortOrder: 0,
        },
      ],
    };
    (prisma.marketplaceAcquisition.findUnique as jest.Mock).mockResolvedValue(
      existing,
    );
    // Older approved content: the version gate must skip the refresh.
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      approvedListing({
        status: MarketplaceListingStatus.APPROVED,
        updatedAt: new Date('2025-12-01T00:00:00.000Z'),
        items: [],
      }),
    );
    (prisma.trip.create as jest.Mock).mockResolvedValue({ id: 999 });
    (prisma.tripMember.create as jest.Mock).mockResolvedValue({});
    (prisma.tripPlanItem.create as jest.Mock).mockResolvedValue({ id: 5001 });
    (prisma.tripPlanItemMember.create as jest.Mock).mockResolvedValue({});
    (tripsService.findTripDetail as jest.Mock).mockResolvedValue({ id: 999 });

    await service.createTripFromListing(77, 1);

    expect(prisma.marketplaceAcquisition.updateMany).not.toHaveBeenCalled();
    expect(prisma.acquisitionItem.deleteMany).not.toHaveBeenCalled();
    expect(prisma.marketplaceAcquisition.create).not.toHaveBeenCalled();
  });

  it('createTripFromListing creates fresh snapshot when no acquisition exists', async () => {
    (prisma.marketplaceAcquisition.findUnique as jest.Mock).mockResolvedValue(
      null,
    );
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
      approvedListing(),
    );
    (prisma.marketplaceAcquisition.create as jest.Mock).mockResolvedValue({
      id: 20,
    });
    (
      prisma.marketplaceAcquisition.findUniqueOrThrow as jest.Mock
    ).mockResolvedValue({
      id: 20,
      userId: 77,
      listingId: 1,
      snapshotName: 'Da Lat Trip',
      snapshotDescription: 'desc',
      snapshotCoverImageUrl: 'cover.jpg',
      snapshotPrice: new Prisma.Decimal('1000000'),
      snapshotCurrency: Currency.VND,
      snapshotDurationDays: 3,
      snapshotTags: [],
      snapshotCityId: 42,
      snapshotStateId: 10,
      snapshotCountryId: 7,
      snapshotCreatorName: 'Creator',
      snapshotCreatorAvatarUrl: 'avatar.jpg',
      acquiredAt: new Date(),
      items: [
        {
          id: 501,
          dayNumber: 1,
          title: 'Coffee',
          description: null,
          location: null,
          startTime: '08:00',
          category: null,
          imageUrls: [],
          sortOrder: 0,
        },
      ],
    });
    (prisma.trip.create as jest.Mock).mockResolvedValue({ id: 999 });
    (prisma.tripMember.create as jest.Mock).mockResolvedValue({});
    (prisma.tripPlanItem.create as jest.Mock).mockResolvedValue({ id: 5001 });
    (prisma.tripPlanItemMember.create as jest.Mock).mockResolvedValue({});
    (tripsService.findTripDetail as jest.Mock).mockResolvedValue({ id: 999 });

    await service.createTripFromListing(77, 1);

    expect(prisma.marketplaceAcquisition.create).toHaveBeenCalled();
    expect(prisma.acquisitionItem.createMany).toHaveBeenCalled();
  });

  it('createTripFromListing throws NotFound when listing missing and no acquisition', async () => {
    (prisma.marketplaceAcquisition.findUnique as jest.Mock).mockResolvedValue(
      null,
    );
    (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.createTripFromListing(77, 999)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ── adminSetListingStatus ──────────────────────────────────────────

  describe('adminSetListingStatus', () => {
    const setupListing = () => {
      const listingForCheck = { id: 42, deletedAt: null };
      const fullListing = {
        id: 42,
        publicId: 'pub-42',
        createdById: 99,
        status: MarketplaceListingStatus.PENDING_REVIEW,
        createdBy: { displayName: 'Creator', avatarUrl: null },
        name: 'Da Lat Plan',
        description: null,
        coverImageUrl: null,
        city: null,
        state: null,
        country: null,
        price: new Prisma.Decimal('1000000'),
        currency: Currency.VND,
        durationDays: 3,
        tags: [],
        createdAt: new Date('2026-03-27T00:00:00.000Z'),
        updatedAt: new Date('2026-03-27T00:00:00.000Z'),
        items: [],
        _count: { acquisitions: 0 },
      };
      (prisma.marketplaceListing.findUnique as jest.Mock)
        .mockResolvedValueOnce(listingForCheck)
        .mockResolvedValueOnce(fullListing);
      (prisma.marketplaceListing.update as jest.Mock).mockResolvedValue(
        undefined,
      );
    };

    it('sends an approved push when status transitions to APPROVED', async () => {
      setupListing();

      await service.adminSetListingStatus(
        42,
        MarketplaceListingStatus.APPROVED,
      );

      expect(notificationsService.sendListingStatusPush).toHaveBeenCalledTimes(
        1,
      );
      expect(notificationsService.sendListingStatusPush).toHaveBeenCalledWith(
        99,
        'Da Lat Plan',
        true,
        42,
      );
    });

    it('sends a rejected push when status transitions to REJECTED', async () => {
      setupListing();

      await service.adminSetListingStatus(
        42,
        MarketplaceListingStatus.REJECTED,
      );

      expect(notificationsService.sendListingStatusPush).toHaveBeenCalledTimes(
        1,
      );
      expect(notificationsService.sendListingStatusPush).toHaveBeenCalledWith(
        99,
        'Da Lat Plan',
        false,
        42,
      );
    });

    it('does not send a push when status transitions to PENDING_REVIEW', async () => {
      setupListing();

      await service.adminSetListingStatus(
        42,
        MarketplaceListingStatus.PENDING_REVIEW,
      );

      expect(notificationsService.sendListingStatusPush).not.toHaveBeenCalled();
    });
  });

  // ── Featured listings ──────────────────────────────────────────────

  describe('featured listings', () => {
    // Superset of LISTING_FEED_INCLUDE and LISTING_DETAIL_INCLUDE shapes so
    // the same fixture serves formatMarketplaceFeedItem and formatListing.
    const makeFeedListing = (id: number, featuredOrder: number) => ({
      id,
      publicId: `pub-${id}`,
      createdById: 99,
      name: `Listing ${id}`,
      description: null,
      createdBy: { displayName: 'Creator', avatarUrl: null },
      coverImageUrl: null,
      price: new Prisma.Decimal('1000000'),
      currency: Currency.VND,
      tags: [],
      city: null,
      state: null,
      country: null,
      durationDays: 3,
      status: MarketplaceListingStatus.APPROVED,
      featuredAt: new Date('2026-07-01T00:00:00.000Z'),
      featuredOrder,
      items: [],
      createdAt: new Date('2026-03-27T00:00:00.000Z'),
      updatedAt: new Date('2026-03-27T00:00:00.000Z'),
      _count: { acquisitions: 0, items: 1 },
    });

    it('adminFeatureListing rejects non-approved listings', async () => {
      (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({
        id: 42,
        deletedAt: null,
        status: MarketplaceListingStatus.PENDING_REVIEW,
        featuredAt: null,
      });

      await expect(service.adminFeatureListing(42)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.marketplaceListing.update).not.toHaveBeenCalled();
    });

    it('adminFeatureListing appends at max featuredOrder + 1', async () => {
      (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({
        id: 42,
        deletedAt: null,
        status: MarketplaceListingStatus.APPROVED,
        featuredAt: null,
      });
      prisma.marketplaceListing.aggregate = jest
        .fn()
        .mockResolvedValue({ _max: { featuredOrder: 4 } });
      (
        prisma.marketplaceListing.findUniqueOrThrow as jest.Mock
      ).mockResolvedValue(makeFeedListing(42, 5));

      await service.adminFeatureListing(42);

      expect(prisma.marketplaceListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 42 },
          data: expect.objectContaining({ featuredOrder: 5 }),
        }),
      );
    });

    it('adminFeatureListing is idempotent for an already-featured listing', async () => {
      (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({
        id: 42,
        deletedAt: null,
        status: MarketplaceListingStatus.APPROVED,
        featuredAt: new Date(),
      });
      (
        prisma.marketplaceListing.findUniqueOrThrow as jest.Mock
      ).mockResolvedValue(makeFeedListing(42, 0));

      await service.adminFeatureListing(42);

      expect(prisma.marketplaceListing.update).not.toHaveBeenCalled();
    });

    it('adminUnfeatureListing nulls both featured fields', async () => {
      (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({
        id: 42,
        deletedAt: null,
      });
      (
        prisma.marketplaceListing.findUniqueOrThrow as jest.Mock
      ).mockResolvedValue(makeFeedListing(42, 0));

      await service.adminUnfeatureListing(42);

      expect(prisma.marketplaceListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { featuredAt: null, featuredOrder: null },
        }),
      );
    });

    it('adminReorderFeatured rejects an id set that does not match the featured set', async () => {
      (prisma.marketplaceListing.findMany as jest.Mock).mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ]);

      await expect(service.adminReorderFeatured([1, 3])).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.marketplaceListing.update).not.toHaveBeenCalled();
    });

    it('adminReorderFeatured writes dense 0..n-1 orders in array order', async () => {
      (prisma.marketplaceListing.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
        // adminListFeaturedListings re-fetch after the reorder
        .mockResolvedValueOnce([makeFeedListing(2, 0), makeFeedListing(1, 1)]);

      await service.adminReorderFeatured([2, 1]);

      expect(prisma.marketplaceListing.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: 2 },
          data: { featuredOrder: 0 },
        }),
      );
      expect(prisma.marketplaceListing.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: 1 },
          data: { featuredOrder: 1 },
        }),
      );
    });

    it('adminSetListingStatus clears featured fields when leaving APPROVED', async () => {
      (prisma.marketplaceListing.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          id: 42,
          deletedAt: null,
          status: MarketplaceListingStatus.APPROVED,
        })
        .mockResolvedValueOnce({
          id: 42,
          publicId: 'pub-42',
          createdById: 99,
          status: MarketplaceListingStatus.REJECTED,
          createdBy: { displayName: 'Creator', avatarUrl: null },
          name: 'Da Lat Plan',
          description: null,
          coverImageUrl: null,
          city: null,
          state: null,
          country: null,
          price: new Prisma.Decimal('1000000'),
          currency: Currency.VND,
          durationDays: 3,
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [],
          _count: { acquisitions: 0 },
        });

      await service.adminSetListingStatus(
        42,
        MarketplaceListingStatus.REJECTED,
      );

      expect(prisma.marketplaceListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: MarketplaceListingStatus.REJECTED,
            featuredAt: null,
            featuredOrder: null,
          },
        }),
      );
    });

    it('listMarketplaceFeed returns featured items in order, empty when none featured', async () => {
      arrangeFeedCalls({
        candidatesByLevel: { none: [] },
        featuredListings: [makeFeedListing(7, 0), makeFeedListing(8, 1)],
      });

      const feed = await service.listMarketplaceFeed({} as any);

      expect(feed.items).toEqual([]);
      expect(feed.featured.map((f) => f.id)).toEqual([7, 8]);

      arrangeFeedCalls({ candidatesByLevel: { none: [] } });
      const emptyFeed = await service.listMarketplaceFeed({} as any);
      expect(emptyFeed.featured).toEqual([]);
    });
  });

  describe('listPublicMarketplaceFeed', () => {
    const feedItem = (id: number): any => ({
      id,
      createdById: 1,
      name: `Listing ${id}`,
      creatorName: 'Creator',
      creatorAvatarUrl: null,
      coverImageUrl: null,
      price: '10',
      currency: 'USD',
      tags: [],
      cityName: null,
      stateName: null,
      countryName: null,
      durationDays: 3,
      activityCount: 5,
      appliedCount: 0,
      averageRating: null,
      ratingCount: 0,
      acquired: false,
      createdAt: new Date('2026-01-01').toISOString(),
    });

    const rawItem = (
      id: number,
      listingId: number,
      dayNumber: number,
      sortOrder: number,
    ) => ({
      id,
      listingId,
      listing: { sourceLocale: 'vi' },
      translations: [],
      dayNumber,
      title: `Item ${id}`,
      description: null,
      location: null,
      latitude: null,
      longitude: null,
      address: null,
      startTime: null,
      category: 'FOOD',
      imageUrls: [`key-${id}.jpg`],
      sortOrder,
      createdAt: new Date('2026-01-01'),
    });

    beforeEach(() => {
      prisma.tripPlanMarketItem = { findMany: jest.fn().mockResolvedValue([]) };
    });

    it('enriches feed items with at most 3 plan items in order, without acquired', async () => {
      jest.spyOn(service, 'listMarketplaceFeed').mockResolvedValue({
        items: [feedItem(1), feedItem(2)],
        featured: [feedItem(3)],
        destinationNames: ['Da Lat'],
        matchedDestinationScope: null,
      } as any);
      (prisma.tripPlanMarketItem.findMany as jest.Mock).mockResolvedValue([
        rawItem(11, 1, 1, 0),
        rawItem(12, 1, 1, 1),
        rawItem(13, 1, 2, 0),
        rawItem(14, 1, 2, 1),
        rawItem(31, 3, 1, 0),
      ]);

      const result = await service.listPublicMarketplaceFeed({} as any);

      expect(service.listMarketplaceFeed).toHaveBeenCalledWith({}, undefined);
      expect(prisma.tripPlanMarketItem.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.tripPlanMarketItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { listingId: { in: [1, 2, 3] } },
          orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        }),
      );

      expect(result.items[0].items.map((i) => i.id)).toEqual([11, 12, 13]);
      expect(result.items[1].items).toEqual([]);
      expect(result.featured[0].items.map((i) => i.id)).toEqual([31]);
      expect(result.items[0]).not.toHaveProperty('acquired');
      expect(result.featured[0]).not.toHaveProperty('acquired');
      expect(result.items[0].items[0].imageUrls).toEqual([
        'https://signed.example.com/placeholder',
      ]);
      expect(result.destinationNames).toEqual(['Da Lat']);
    });

    it('skips the item query when the feed is empty', async () => {
      jest.spyOn(service, 'listMarketplaceFeed').mockResolvedValue({
        items: [],
        featured: [],
        destinationNames: [],
        matchedDestinationScope: null,
      } as any);

      const result = await service.listPublicMarketplaceFeed({} as any);

      expect(prisma.tripPlanMarketItem.findMany).not.toHaveBeenCalled();
      expect(result.items).toEqual([]);
      expect(result.featured).toEqual([]);
    });
  });

  // silence unused import warnings
  void InviteStatus;
  void ForbiddenException;

  // ── Localization (Accept-Language → translations) ─────────────────

  describe('localization', () => {
    const translated = (overrides: Partial<any> = {}) =>
      approvedListing({
        ...overrides,
        sourceLocale: 'vi',
        translations: [
          {
            locale: 'en',
            name: 'Da Lat Trip EN',
            description: null,
            updatedAt: new Date('2026-03-27T00:00:00.000Z'),
          },
        ],
        items: [
          {
            id: 100,
            listingId: 1,
            dayNumber: 1,
            title: 'Cà phê',
            description: 'x',
            location: null,
            latitude: null,
            longitude: null,
            address: null,
            startTime: '08:00',
            category: null,
            imageUrls: [],
            sortOrder: 0,
            createdAt: new Date('2026-03-27T00:00:00.000Z'),
            updatedAt: new Date('2026-03-27T00:00:00.000Z'),
            translations: [
              {
                locale: 'en',
                title: 'Coffee',
                description: null,
                updatedAt: new Date('2026-03-27T00:00:00.000Z'),
              },
            ],
          },
        ],
      });

    it('getListing serves the translation for the request locale with per-field fallback', async () => {
      clsMock.get.mockReturnValue('en');
      (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
        translated(),
      );
      const dto = await service.getListing(1, 77);
      expect(dto.name).toBe('Da Lat Trip EN');
      expect(dto.description).toBe('desc');
      expect(dto.items[0].title).toBe('Coffee');
      expect(dto.items[0].description).toBe('x');
      expect(dto.sourceLocale).toBe('vi');
      expect(dto.availableLocales).toEqual(['vi', 'en']);
    });

    it('getListing serves base text when no header / source locale / no row', async () => {
      (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
        translated(),
      );
      clsMock.get.mockReturnValue(null);
      expect((await service.getListing(1, 77)).name).toBe('Da Lat Trip');
      clsMock.get.mockReturnValue('vi');
      expect((await service.getListing(1, 77)).name).toBe('Da Lat Trip');
      clsMock.get.mockReturnValue('en');
      (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
        approvedListing({ sourceLocale: 'vi', translations: [] }),
      );
      expect((await service.getListing(1, 77)).name).toBe('Da Lat Trip');
    });

    it('creator edit context and admin/my-listings always get base text', async () => {
      clsMock.get.mockReturnValue('en');
      (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
        translated({ createdById: 5 }),
      );
      expect((await service.getListing(1, 5, 'edit')).name).toBe('Da Lat Trip');
      (prisma.marketplaceListing.findMany as jest.Mock).mockResolvedValue([
        translated(),
      ]);
      expect((await service.listMyListings(5))[0].name).toBe('Da Lat Trip');
      expect(
        (await service.adminListListings(MarketplaceListingStatus.APPROVED))[0]
          .name,
      ).toBe('Da Lat Trip');
    });

    it('acquisition snapshot is frozen in the requester locale', async () => {
      clsMock.get.mockReturnValue('en');
      (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
        translated(),
      );
      (prisma.marketplaceAcquisition.create as jest.Mock).mockResolvedValue({
        id: 20,
        userId: 77,
        listingId: 1,
        acquiredAt: new Date(),
      });
      await service.applyForListing(77, 1);
      expect(prisma.marketplaceAcquisition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            snapshotName: 'Da Lat Trip EN',
            snapshotDescription: 'desc',
          }),
        }),
      );
      expect(prisma.acquisitionItem.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ title: 'Coffee', description: 'x' })],
      });
    });

    it('updateListing name/description edit drops stale translations', async () => {
      (prisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(
        approvedListing({ createdById: 5 }),
      );
      (
        prisma.marketplaceListing.findUniqueOrThrow as jest.Mock
      ).mockResolvedValue({ status: MarketplaceListingStatus.PENDING_REVIEW });
      (prisma.marketplaceListing.update as jest.Mock).mockResolvedValue(
        approvedListing(),
      );
      await service.updateListing(1, 5, { name: 'New' } as any);
      expect(
        prisma.marketplaceListingTranslation.deleteMany,
      ).toHaveBeenCalledWith({ where: { listingId: 1 } });
    });
  });
});
