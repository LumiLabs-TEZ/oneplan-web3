import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActivityAction,
  ContentLocale,
  Currency,
  InviteStatus,
  ListingTag,
  MarketplaceListingStatus,
  Prisma,
  TripStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { nanoid } from 'nanoid';

const LISTING_PUBLIC_ID_LENGTH = 12;
import { ClsService } from 'nestjs-cls';
import { CONTENT_LOCALE_CLS_KEY } from '../common/locale/content-locale';
import { PrismaService } from '../prisma/prisma.service';
import {
  availableLocales,
  pickItemText,
  pickListingText,
} from './listing-text';
import { StorageService } from '../storage/storage.service';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { TripsService } from '../trips/trips.service';
import { TripDto } from '../trips/dto/trip.dto';
import { CreateMarketplaceListingDto } from './dto/create-marketplace-listing.dto';
import { CreateDraftListingDto } from './dto/create-draft-listing.dto';
import { UpdateMarketplaceListingDto } from './dto/update-marketplace-listing.dto';
import { CreateMarketItemDto } from './dto/create-market-item.dto';
import { UpdateMarketItemDto } from './dto/update-market-item.dto';
import { MarketplaceListingDto } from './dto/marketplace-listing.dto';
import { MarketItemDto } from './dto/market-item.dto';
import { ListMarketplaceFeedQueryDto } from './dto/list-marketplace-feed-query.dto';
import { MarketplaceFeedDto } from './dto/marketplace-feed.dto';
import { MarketplaceFeedItemDto } from './dto/marketplace-feed-item.dto';
import { MarketplaceFeedMatchedScope } from './dto/marketplace-feed-matched-scope.enum';
import { MarketplaceFeedTab } from './dto/marketplace-feed-tab.enum';
import {
  PublicMarketplaceFeedDto,
  PublicMarketplaceFeedItemDto,
} from './dto/public-marketplace-feed.dto';
import { SortDirection } from './dto/sort-direction.enum';
import { CreatorProfileDto } from './dto/creator-profile.dto';
import { MarketplaceAcquisitionDto } from './dto/marketplace-acquisition.dto';
import { MarketplaceAppliedStatusDto } from './dto/marketplace-applied-status.dto';
import { CreateMarketplaceRatingDto } from './dto/create-marketplace-rating.dto';
import { MarketplaceRatingResponseDto } from './dto/marketplace-rating-response.dto';
import { MarketplaceAcquisitionSummaryDto } from './dto/marketplace-acquisition-summary.dto';
import { MarketplaceAcquisitionDetailDto } from './dto/marketplace-acquisition-detail.dto';
import { AcquisitionItemDto } from './dto/acquisition-item.dto';
import { PurchaseMarketplaceListingDto } from './dto/purchase-marketplace-listing.dto';
import { MarketplacePurchaseVerifierService } from './marketplace-purchase-verifier.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AcquirableListing,
  MarketplaceAcquisitionService,
} from './acquisition/marketplace-acquisition.service';
import { MissionsService } from '../missions/missions.service';

type ListingRatingStats = { avg: number | null; count: number };
const EMPTY_RATING_STATS: ListingRatingStats = { avg: null, count: 0 };

function assertCoordinatePair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): void {
  const hasLat = latitude !== undefined && latitude !== null;
  const hasLng = longitude !== undefined && longitude !== null;
  if (hasLat !== hasLng) {
    throw new BadRequestException(
      'latitude and longitude must be provided together',
    );
  }
}

function assertCoordinatePatch(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): void {
  if (latitude === undefined && longitude === undefined) return;
  if ((latitude ?? null) === null && (longitude ?? null) === null) return;
  if ((latitude ?? null) !== null && (longitude ?? null) !== null) return;
  throw new BadRequestException(
    'latitude and longitude must be set or cleared together',
  );
}

const LISTING_TRANSLATIONS_SELECT = {
  select: { locale: true, name: true, description: true },
} as const;

const ITEM_TRANSLATIONS_SELECT = {
  select: { locale: true, title: true, description: true },
} as const;

const LISTING_DETAIL_INCLUDE = {
  createdBy: { select: { displayName: true, avatarUrl: true } },
  city: { select: { id: true, name: true } },
  state: { select: { id: true, name: true } },
  country: { select: { id: true, name: true } },
  translations: LISTING_TRANSLATIONS_SELECT,
  items: {
    orderBy: [
      { dayNumber: Prisma.SortOrder.asc },
      { sortOrder: Prisma.SortOrder.asc },
      { id: Prisma.SortOrder.asc },
    ],
    include: { translations: ITEM_TRANSLATIONS_SELECT },
  },
  _count: { select: { acquisitions: true } },
} satisfies Prisma.MarketplaceListingInclude;

const LISTING_FEED_INCLUDE = {
  createdBy: { select: { displayName: true, avatarUrl: true } },
  city: { select: { name: true } },
  state: { select: { name: true } },
  country: { select: { name: true } },
  translations: LISTING_TRANSLATIONS_SELECT,
  _count: { select: { acquisitions: true, items: true } },
} satisfies Prisma.MarketplaceListingInclude;

const ACQUISITION_SUMMARY_INCLUDE = {
  listing: { select: { status: true, deletedAt: true } },
  _count: { select: { items: true } },
} as const;

type LocationNames = {
  cities: Map<number, string>;
  states: Map<number, string>;
  countries: Map<number, string>;
};

// Only listings in this state are publicly visible.
const PUBLIC_FEED_ITEMS_PER_LISTING = 3;

const PUBLIC_LISTING_WHERE: Prisma.MarketplaceListingWhereInput = {
  status: MarketplaceListingStatus.APPROVED,
  deletedAt: null,
};

// Admin-curated featured listings (Home "Popular plans"). Requiring the
// public predicate too is a second guard — every path that moves a listing
// out of APPROVED also nulls the featured fields.
const FEATURED_LISTING_WHERE: Prisma.MarketplaceListingWhereInput = {
  ...PUBLIC_LISTING_WHERE,
  featuredAt: { not: null },
};

const FEATURED_ORDER_BY: Prisma.MarketplaceListingOrderByWithRelationInput[] = [
  { featuredOrder: Prisma.SortOrder.asc },
  { featuredAt: Prisma.SortOrder.asc },
];

const MARKETPLACE_FEED_DEFAULT_TAKE = 20;
const MARKETPLACE_FEED_MAX_TAKE = 50;

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly activityService: TripActivityService,
    private readonly tripsService: TripsService,
    private readonly config: ConfigService,
    private readonly purchaseVerifier: MarketplacePurchaseVerifierService,
    private readonly notificationsService: NotificationsService,
    private readonly acquisition: MarketplaceAcquisitionService,
    private readonly missions: MissionsService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Content locale of the current request (from `Accept-Language`), or null
   * when absent/unsupported. Null means "serve base text". Only PUBLIC read
   * paths pass this into the formatters — creator/admin paths always get the
   * base row so dashboards show what was actually written.
   */
  private requestLocale(): ContentLocale | null {
    return this.cls.get<ContentLocale | null>(CONTENT_LOCALE_CLS_KEY) ?? null;
  }

  /**
   * Restrict the feed to listings readable in `locale`: authored in that
   * language or carrying a translation for it. Null locale (missing /
   * unsupported Accept-Language) disables the filter.
   */
  private localizedListingWhere(
    locale: ContentLocale | null,
  ): Prisma.MarketplaceListingWhereInput | null {
    if (!locale) return null;
    return {
      OR: [{ sourceLocale: locale }, { translations: { some: { locale } } }],
    };
  }

  // Runs the destination cascade (most-specific scope first) and returns the
  // matched scope plus its candidates. `null` scope means no destination
  // filter was requested.
  private async resolveFeedCandidates(
    where: Prisma.MarketplaceListingWhereInput,
    cascade: Array<{
      scope: MarketplaceFeedMatchedScope;
      clause: Prisma.MarketplaceListingWhereInput;
    }>,
  ): Promise<{
    scope: MarketplaceFeedMatchedScope | null;
    candidates: Array<{ id: number; price: Prisma.Decimal; createdAt: Date }>;
  }> {
    if (cascade.length === 0) {
      const candidates = await this.prisma.marketplaceListing.findMany({
        where,
        select: { id: true, price: true, createdAt: true },
      });
      return { scope: null, candidates };
    }
    for (const level of cascade) {
      const candidates = await this.prisma.marketplaceListing.findMany({
        where: { ...where, ...level.clause },
        select: { id: true, price: true, createdAt: true },
      });
      if (candidates.length > 0) {
        return { scope: level.scope, candidates };
      }
    }
    return { scope: MarketplaceFeedMatchedScope.NONE, candidates: [] };
  }

  async listMarketplaceFeed(
    query: ListMarketplaceFeedQueryDto,
    userId?: number,
  ): Promise<MarketplaceFeedDto> {
    const normalizedTake = this.normalizeMarketplaceFeedTake(query.take);
    const tab = query.tab ?? MarketplaceFeedTab.TRENDING;
    const locale = this.requestLocale();

    const baseWhere: Prisma.MarketplaceListingWhereInput = {
      ...PUBLIC_LISTING_WHERE,
    };
    if (query.tag) {
      baseWhere.tags = { has: query.tag };
    }
    if (
      query.durationMinDays !== undefined ||
      query.durationMaxDays !== undefined
    ) {
      baseWhere.durationDays = {
        ...(query.durationMinDays !== undefined && {
          gte: query.durationMinDays,
        }),
        ...(query.durationMaxDays !== undefined && {
          lte: query.durationMaxDays,
        }),
      };
    }

    // Destination cascade: try most-specific scope first; if it yields nothing,
    // widen to the next level so users always have *something* to look at.
    const cascade: Array<{
      scope: MarketplaceFeedMatchedScope;
      clause: Prisma.MarketplaceListingWhereInput;
    }> = [];
    if (query.cityId !== undefined) {
      cascade.push({
        scope: MarketplaceFeedMatchedScope.CITY,
        clause: { cityId: query.cityId },
      });
    }
    if (query.stateId !== undefined) {
      cascade.push({
        scope: MarketplaceFeedMatchedScope.STATE,
        clause: { stateId: query.stateId },
      });
    }
    if (query.countryId !== undefined) {
      cascade.push({
        scope: MarketplaceFeedMatchedScope.COUNTRY,
        clause: { countryId: query.countryId },
      });
    }

    const languageWhere = this.localizedListingWhere(locale);
    const scopedWhere = languageWhere
      ? { ...baseWhere, ...languageWhere }
      : baseWhere;

    let { scope: matchedDestinationScope, candidates: matchedCandidates } =
      await this.resolveFeedCandidates(scopedWhere, cascade);

    // Language is a hard filter until it would leave nothing at all; then the
    // feed falls back to all languages so the market never goes dark.
    if (
      languageWhere &&
      (matchedDestinationScope === MarketplaceFeedMatchedScope.NONE ||
        matchedCandidates.length === 0)
    ) {
      ({ scope: matchedDestinationScope, candidates: matchedCandidates } =
        await this.resolveFeedCandidates(baseWhere, cascade));
    }

    if (
      matchedDestinationScope === MarketplaceFeedMatchedScope.NONE ||
      matchedCandidates.length === 0
    ) {
      // Featured is a global editorial list, independent of the destination
      // cascade — it must survive the no-match early return too.
      const [destinationNames, featured] = await Promise.all([
        this.loadGlobalDestinationNames(),
        this.fetchFeaturedFeedItems(userId, languageWhere),
      ]);
      return {
        items: [],
        featured,
        destinationNames,
        matchedDestinationScope,
      };
    }

    const sortedIds = await this.sortFeedCandidates(
      matchedCandidates,
      tab,
      query.budgetSort,
    );
    const topIds = sortedIds.slice(0, normalizedTake);

    const include = userId
      ? {
          ...LISTING_FEED_INCLUDE,
          acquisitions: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
        }
      : LISTING_FEED_INCLUDE;

    const [fullListings, statsByListing, destinationNames, featured] =
      await Promise.all([
        this.prisma.marketplaceListing.findMany({
          where: { id: { in: topIds } },
          include,
        }),
        this.fetchRatingStatsByListing(topIds),
        this.loadGlobalDestinationNames(),
        this.fetchFeaturedFeedItems(userId, languageWhere),
      ]);
    const listingById = new Map(fullListings.map((l) => [l.id, l]));

    const items = await Promise.all(
      topIds
        .map((id) => listingById.get(id))
        .filter((l): l is NonNullable<typeof l> => !!l)
        .map((listing) => {
          const acquired = Array.isArray((listing as any).acquisitions)
            ? (listing as any).acquisitions.length > 0
            : false;
          const stats = statsByListing.get(listing.id) ?? EMPTY_RATING_STATS;
          return this.formatMarketplaceFeedItem(
            listing,
            acquired,
            stats,
            locale,
          );
        }),
    );

    return {
      items,
      featured,
      destinationNames,
      matchedDestinationScope,
    };
  }

  // Ordered featured listings in feed-item shape, with the caller's
  // acquired flag hydrated like the main feed items. When a content locale is
  // active, only listings readable in it are returned — unless that would
  // empty the shelf, in which case it falls back to every featured listing.
  private async fetchFeaturedFeedItems(
    userId?: number,
    languageWhere?: Prisma.MarketplaceListingWhereInput | null,
  ): Promise<MarketplaceFeedItemDto[]> {
    const include = userId
      ? {
          ...LISTING_FEED_INCLUDE,
          acquisitions: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
        }
      : LISTING_FEED_INCLUDE;

    const loadListings = (where: Prisma.MarketplaceListingWhereInput) =>
      this.prisma.marketplaceListing.findMany({
        where,
        include,
        orderBy: FEATURED_ORDER_BY,
      });

    let listings = await loadListings(
      languageWhere
        ? { ...FEATURED_LISTING_WHERE, ...languageWhere }
        : FEATURED_LISTING_WHERE,
    );
    if (listings.length === 0 && languageWhere) {
      listings = await loadListings(FEATURED_LISTING_WHERE);
    }
    if (listings.length === 0) return [];

    const statsByListing = await this.fetchRatingStatsByListing(
      listings.map((l) => l.id),
    );

    const locale = this.requestLocale();
    return Promise.all(
      listings.map((listing) => {
        const acquired = Array.isArray((listing as any).acquisitions)
          ? (listing as any).acquisitions.length > 0
          : false;
        const stats = statsByListing.get(listing.id) ?? EMPTY_RATING_STATS;
        return this.formatMarketplaceFeedItem(listing, acquired, stats, locale);
      }),
    );
  }

  // Unauthenticated feed: same ranking as listMarketplaceFeed, each
  // listing enriched with its first 3 plan items (no acquired flag).
  async listPublicMarketplaceFeed(
    query: ListMarketplaceFeedQueryDto,
  ): Promise<PublicMarketplaceFeedDto> {
    const feed = await this.listMarketplaceFeed(query, undefined);

    const listingIds = [
      ...new Set(
        [...feed.items, ...feed.featured].map((listing) => listing.id),
      ),
    ];

    const itemsByListing = new Map<number, MarketItemDto[]>();
    if (listingIds.length > 0) {
      const locale = this.requestLocale();
      const rawItems = await this.prisma.tripPlanMarketItem.findMany({
        where: { listingId: { in: listingIds } },
        orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        include: {
          translations: ITEM_TRANSLATIONS_SELECT,
          listing: { select: { sourceLocale: true } },
        },
      });
      // Group in iteration order so the query's ordering is preserved,
      // then keep only the first 3 per listing.
      const grouped = new Map<number, typeof rawItems>();
      for (const item of rawItems) {
        const bucket = grouped.get(item.listingId);
        if (bucket) {
          if (bucket.length < PUBLIC_FEED_ITEMS_PER_LISTING) bucket.push(item);
        } else {
          grouped.set(item.listingId, [item]);
        }
      }
      for (const [listingId, items] of grouped) {
        itemsByListing.set(
          listingId,
          await Promise.all(
            items.map((item) =>
              this.formatItem(item, {
                sourceLocale: item.listing.sourceLocale,
                locale,
              }),
            ),
          ),
        );
      }
    }

    const toPublicFeedItem = (
      item: MarketplaceFeedItemDto,
    ): PublicMarketplaceFeedItemDto => {
      const { acquired, ...rest } = item;
      void acquired;
      return { ...rest, items: itemsByListing.get(item.id) ?? [] };
    };

    return {
      items: feed.items.map(toPublicFeedItem),
      featured: feed.featured.map(toPublicFeedItem),
      destinationNames: feed.destinationNames,
      matchedDestinationScope: feed.matchedDestinationScope,
    };
  }

  // ── Listing CRUD ───────────────────────────────────────────────────

  async createListing(
    userId: number,
    dto: CreateMarketplaceListingDto,
    // Language of the submitted text. Defaults to the request's
    // Accept-Language; callers that know better (trip-generator) pass it.
    sourceLocale?: ContentLocale,
  ): Promise<MarketplaceListingDto> {
    let currency = dto.currency;
    if (!currency) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { preferredCurrency: true },
      });
      currency = user?.preferredCurrency ?? Currency.USD;
    }

    let listing;
    try {
      listing = await this.prisma.marketplaceListing.create({
        data: {
          publicId: nanoid(LISTING_PUBLIC_ID_LENGTH),
          createdById: userId,
          name: dto.name,
          description: dto.description,
          coverImageUrl:
            dto.coverImageUrl !== undefined
              ? this.storageService.extractObjectKey(dto.coverImageUrl)
              : undefined,
          playProductId: dto.playProductId ?? null,
          cityId: dto.cityId,
          stateId: dto.stateId,
          countryId: dto.countryId,
          price: dto.price,
          currency,
          durationDays: dto.durationDays,
          tags: dto.tags,
          sourceLocale:
            sourceLocale ?? this.requestLocale() ?? ContentLocale.vi,
          status: MarketplaceListingStatus.PENDING_REVIEW,
        },
        include: LISTING_DETAIL_INCLUDE,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003' &&
        error.meta?.constraint === 'marketplace_listing_created_by_id_fkey'
      ) {
        throw new UnauthorizedException(
          'User account not found. Please log in again.',
        );
      }
      throw error;
    }

    return this.formatListing(listing, EMPTY_RATING_STATS);
  }

  async createDraftListing(
    userId: number,
    dto: CreateDraftListingDto,
  ): Promise<MarketplaceListingDto> {
    let currency = dto.currency;
    if (!currency) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { preferredCurrency: true },
      });
      currency = user?.preferredCurrency ?? Currency.USD;
    }

    let listing;
    try {
      listing = await this.prisma.marketplaceListing.create({
        data: {
          publicId: nanoid(LISTING_PUBLIC_ID_LENGTH),
          createdById: userId,
          name: dto.name,
          description: dto.description,
          coverImageUrl:
            dto.coverImageUrl !== undefined
              ? this.storageService.extractObjectKey(dto.coverImageUrl)
              : undefined,
          cityId: dto.cityId,
          stateId: dto.stateId,
          countryId: dto.countryId,
          price: dto.price ?? 0,
          currency,
          durationDays: dto.durationDays ?? 1,
          tags: dto.tags ?? [],
          sourceLocale: this.requestLocale() ?? ContentLocale.vi,
          status: MarketplaceListingStatus.DRAFT,
        },
        include: LISTING_DETAIL_INCLUDE,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003' &&
        error.meta?.constraint === 'marketplace_listing_created_by_id_fkey'
      ) {
        throw new UnauthorizedException(
          'User account not found. Please log in again.',
        );
      }
      throw error;
    }

    return this.formatListing(listing, EMPTY_RATING_STATS);
  }

  async publishListing(
    listingId: number,
    userId: number,
  ): Promise<MarketplaceListingDto> {
    await this.assertListingOwner(listingId, userId);

    const current = await this.prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: listingId },
      include: LISTING_DETAIL_INCLUDE,
    });

    if (current.status !== MarketplaceListingStatus.DRAFT) {
      throw new ConflictException('Only draft listings can be published');
    }

    const missing: string[] = [];
    if (!current.name?.trim()) missing.push('name');
    // City and state are optional — some destinations are country-level only.
    if (current.countryId === null) missing.push('country');
    if (current.price.lessThanOrEqualTo(0)) missing.push('price');
    if (current.durationDays < 1) missing.push('durationDays');
    if (current.tags.length === 0) missing.push('tags');
    if (current.items.length === 0) missing.push('items');
    if (missing.length > 0) {
      throw new BadRequestException(
        `Cannot publish: missing or invalid fields — ${missing.join(', ')}`,
      );
    }

    const updated = await this.prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { status: MarketplaceListingStatus.PENDING_REVIEW },
      include: LISTING_DETAIL_INCLUDE,
    });

    const stats = await this.fetchRatingStatsForListing(listingId);
    return this.formatListing(updated, stats);
  }

  async listMyListings(userId: number): Promise<MarketplaceListingDto[]> {
    const listings = await this.prisma.marketplaceListing.findMany({
      where: { createdById: userId, deletedAt: null },
      include: LISTING_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    const statsByListing = await this.fetchRatingStatsByListing(
      listings.map((l) => l.id),
    );

    return Promise.all(
      listings.map((l) =>
        this.formatListing(l, statsByListing.get(l.id) ?? EMPTY_RATING_STATS),
      ),
    );
  }

  async getCreatorProfile(userId: number): Promise<CreatorProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, avatarUrl: true, createdAt: true },
    });

    if (!user) {
      throw new NotFoundException('Creator not found');
    }

    // Public profile: only APPROVED, not-deleted listings.
    const listings = await this.prisma.marketplaceListing.findMany({
      where: { createdById: userId, ...PUBLIC_LISTING_WHERE },
      include: LISTING_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const statsByListing = await this.fetchRatingStatsByListing(
      listings.map((l) => l.id),
    );
    const locale = this.requestLocale();
    const listingDtos = await Promise.all(
      listings.map((l) =>
        this.formatListing(
          l,
          statsByListing.get(l.id) ?? EMPTY_RATING_STATS,
          locale,
        ),
      ),
    );
    const avatarUrl = await this.resolveMediaUrlOrPassThrough(user.avatarUrl);

    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl,
      createdAt: user.createdAt.toISOString(),
      listings: listingDtos,
    };
  }

  async getListing(
    idOrPublicId: string | number,
    userId?: number,
    context?: string,
  ): Promise<MarketplaceListingDto> {
    const param = String(idOrPublicId);
    // All-digit nanoids are astronomically unlikely with the default alphabet,
    // so we route purely-numeric strings to the int-id lookup and everything
    // else to the publicId lookup.
    const isNumericId = /^\d+$/.test(param);
    const where: Prisma.MarketplaceListingWhereUniqueInput = isNumericId
      ? { id: Number(param) }
      : { publicId: param };

    const listing = await this.prisma.marketplaceListing.findUnique({
      where,
      include: {
        ...LISTING_DETAIL_INCLUDE,
        acquisitions: userId
          ? { where: { userId }, select: { id: true }, take: 1 }
          : false,
      },
    });

    if (!listing || listing.deletedAt !== null) {
      throw new NotFoundException('Listing not found');
    }

    const isOwner = userId !== undefined && listing.createdById === userId;
    const isEditContext = context === 'edit';

    if (isEditContext) {
      // Edit-workspace callers must own the listing. Return 404 (not 403) so
      // we don't reveal the existence of other users' listings.
      if (!isOwner) {
        throw new NotFoundException('Listing not found');
      }
    } else {
      const hasAcquired =
        Array.isArray((listing as any).acquisitions) &&
        (listing as any).acquisitions.length > 0;

      if (
        listing.status !== MarketplaceListingStatus.APPROVED &&
        !isOwner &&
        !hasAcquired
      ) {
        throw new NotFoundException('Listing not found');
      }
    }

    const stats = await this.fetchRatingStatsForListing(listing.id);
    // Edit workspace shows the creator their own (base) text.
    return this.formatListing(
      listing,
      stats,
      isEditContext ? null : this.requestLocale(),
    );
  }

  /**
   * Minimal, unauthenticated preview for the public share-link landing page
   * (deeplinks controller). Only resolves APPROVED listings — anything
   * else (draft/pending/rejected/deleted/missing) throws NotFound so the
   * landing page falls back to generic copy. Accepts a numeric id or publicId,
   * mirroring {@link getListing}.
   */
  async getPublicListingPreview(idOrPublicId: string | number): Promise<{
    name: string;
    creatorName: string;
    durationDays: number;
  }> {
    const param = String(idOrPublicId);
    const isNumericId = /^\d+$/.test(param);
    const where: Prisma.MarketplaceListingWhereUniqueInput = isNumericId
      ? { id: Number(param) }
      : { publicId: param };

    const listing = await this.prisma.marketplaceListing.findUnique({
      where,
      select: {
        name: true,
        description: true,
        sourceLocale: true,
        translations: LISTING_TRANSLATIONS_SELECT,
        durationDays: true,
        status: true,
        deletedAt: true,
        createdBy: { select: { displayName: true } },
      },
    });

    if (
      !listing ||
      listing.deletedAt !== null ||
      listing.status !== MarketplaceListingStatus.APPROVED
    ) {
      throw new NotFoundException('Listing not found');
    }

    return {
      name: pickListingText(listing, this.requestLocale()).name,
      creatorName: listing.createdBy.displayName,
      durationDays: listing.durationDays,
    };
  }

  async updateListing(
    listingId: number,
    userId: number,
    dto: UpdateMarketplaceListingDto,
  ): Promise<MarketplaceListingDto> {
    await this.assertListingOwner(listingId, userId);

    const data: Prisma.MarketplaceListingUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.coverImageUrl !== undefined)
      data.coverImageUrl = this.storageService.extractObjectKey(
        dto.coverImageUrl,
      );
    if (dto.cityId !== undefined) {
      data.city =
        dto.cityId === null
          ? { disconnect: true }
          : { connect: { id: dto.cityId } };
    }
    if (dto.stateId !== undefined) {
      data.state =
        dto.stateId === null
          ? { disconnect: true }
          : { connect: { id: dto.stateId } };
    }
    if (dto.countryId !== undefined) {
      data.country =
        dto.countryId === null
          ? { disconnect: true }
          : { connect: { id: dto.countryId } };
    }
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.durationDays !== undefined) data.durationDays = dto.durationDays;
    if (dto.playProductId !== undefined) data.playProductId = dto.playProductId;
    if (dto.tags !== undefined) data.tags = dto.tags;

    // Any public-visible edit on an APPROVED listing sends it back to review.
    const listing = await this.prisma.$transaction(async (tx) => {
      const current = await tx.marketplaceListing.findUniqueOrThrow({
        where: { id: listingId },
        select: { status: true },
      });
      if (current.status === MarketplaceListingStatus.APPROVED) {
        data.status = MarketplaceListingStatus.PENDING_REVIEW;
        // Leaving APPROVED always drops the featured slot.
        data.featuredAt = null;
        data.featuredOrder = null;
      }
      // Base text changed → existing translations are stale. Drop them; the
      // admin regenerates during review.
      if (dto.name !== undefined || dto.description !== undefined) {
        await tx.marketplaceListingTranslation.deleteMany({
          where: { listingId },
        });
      }
      return tx.marketplaceListing.update({
        where: { id: listingId },
        data,
        include: LISTING_DETAIL_INCLUDE,
      });
    });

    const stats = await this.fetchRatingStatsForListing(listingId);
    return this.formatListing(listing, stats);
  }

  async deleteListing(listingId: number, userId: number): Promise<void> {
    await this.assertListingOwner(listingId, userId);
    // Soft delete — existing buyer snapshots must survive.
    await this.prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { deletedAt: new Date(), featuredAt: null, featuredOrder: null },
    });
  }

  // ── Admin operations ───────────────────────────────────────────────
  // Authorisation is enforced by AdminGuard at the controller. These
  // methods bypass ownership checks intentionally.

  async adminGetListingByPublicId(
    publicId: string,
  ): Promise<MarketplaceListingDto> {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { publicId },
      include: LISTING_DETAIL_INCLUDE,
    });
    if (!listing || listing.deletedAt !== null) {
      throw new NotFoundException('Listing not found');
    }
    const stats = await this.fetchRatingStatsForListing(listing.id);
    return this.formatListing(listing, stats);
  }

  async adminListListings(
    status: MarketplaceListingStatus,
  ): Promise<MarketplaceListingDto[]> {
    const listings = await this.prisma.marketplaceListing.findMany({
      where: { status, deletedAt: null },
      include: LISTING_DETAIL_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    const statsByListing = await this.fetchRatingStatsByListing(
      listings.map((l) => l.id),
    );

    return Promise.all(
      listings.map((l) =>
        this.formatListing(l, statsByListing.get(l.id) ?? EMPTY_RATING_STATS),
      ),
    );
  }

  async adminSetListingStatus(
    listingId: number,
    status: MarketplaceListingStatus,
  ): Promise<MarketplaceListingDto> {
    const existing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { id: true, deletedAt: true, status: true },
    });
    if (!existing || existing.deletedAt !== null) {
      throw new NotFoundException('Listing not found');
    }

    if (existing.status === MarketplaceListingStatus.DRAFT) {
      throw new BadRequestException(
        'Drafts cannot be moderated until the owner publishes them',
      );
    }

    if (status === MarketplaceListingStatus.DRAFT) {
      throw new BadRequestException(
        'Listings cannot be moved back to draft by an admin',
      );
    }

    await this.prisma.marketplaceListing.update({
      where: { id: listingId },
      data:
        status === MarketplaceListingStatus.APPROVED
          ? { status }
          : // Leaving APPROVED always drops the featured slot.
            { status, featuredAt: null, featuredOrder: null },
    });

    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: LISTING_DETAIL_INCLUDE,
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (status === MarketplaceListingStatus.APPROVED) {
      // upload_plan (1/month, deduped per listing) pays on admin approval —
      // idempotent, so approve → return-to-review → approve can't double-pay.
      void this.missions.onListingApproved(listing.createdById, listing.id);
    }

    if (
      status === MarketplaceListingStatus.APPROVED ||
      status === MarketplaceListingStatus.REJECTED
    ) {
      this.notificationsService
        .sendListingStatusPush(
          listing.createdById,
          listing.name,
          status === MarketplaceListingStatus.APPROVED,
          listing.id,
        )
        .catch((err) =>
          this.logger.error('Failed to send listing status push', err),
        );
    }

    const stats = await this.fetchRatingStatsForListing(listingId);
    return this.formatListing(listing, stats);
  }

  // ── Featured listings (Home "Popular plans") ───────────────────────
  // Response array order IS the featured order — MarketplaceListingDto
  // carries no featuredOrder field.

  async adminListFeaturedListings(): Promise<MarketplaceListingDto[]> {
    const listings = await this.prisma.marketplaceListing.findMany({
      where: FEATURED_LISTING_WHERE,
      include: LISTING_DETAIL_INCLUDE,
      orderBy: FEATURED_ORDER_BY,
    });

    const statsByListing = await this.fetchRatingStatsByListing(
      listings.map((l) => l.id),
    );

    return Promise.all(
      listings.map((l) =>
        this.formatListing(l, statsByListing.get(l.id) ?? EMPTY_RATING_STATS),
      ),
    );
  }

  async adminFeatureListing(listingId: number): Promise<MarketplaceListingDto> {
    const existing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { id: true, deletedAt: true, status: true, featuredAt: true },
    });
    if (!existing || existing.deletedAt !== null) {
      throw new NotFoundException('Listing not found');
    }
    if (existing.status !== MarketplaceListingStatus.APPROVED) {
      throw new BadRequestException('Only approved listings can be featured');
    }

    if (existing.featuredAt === null) {
      // Append at the end; gaps in featuredOrder are fine (sort is what
      // matters), so unfeature never needs to compact.
      await this.prisma.$transaction(async (tx) => {
        const max = await tx.marketplaceListing.aggregate({
          where: FEATURED_LISTING_WHERE,
          _max: { featuredOrder: true },
        });
        await tx.marketplaceListing.update({
          where: { id: listingId },
          data: {
            featuredAt: new Date(),
            featuredOrder: (max._max.featuredOrder ?? -1) + 1,
          },
        });
      });
    }

    const listing = await this.prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: listingId },
      include: LISTING_DETAIL_INCLUDE,
    });
    const stats = await this.fetchRatingStatsForListing(listingId);
    return this.formatListing(listing, stats);
  }

  async adminUnfeatureListing(
    listingId: number,
  ): Promise<MarketplaceListingDto> {
    const existing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { id: true, deletedAt: true },
    });
    if (!existing || existing.deletedAt !== null) {
      throw new NotFoundException('Listing not found');
    }

    await this.prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { featuredAt: null, featuredOrder: null },
    });

    const listing = await this.prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: listingId },
      include: LISTING_DETAIL_INCLUDE,
    });
    const stats = await this.fetchRatingStatsForListing(listingId);
    return this.formatListing(listing, stats);
  }

  async adminReorderFeatured(
    listingIds: number[],
  ): Promise<MarketplaceListingDto[]> {
    // Set check + writes inside one transaction so a concurrent unfeature
    // can't get an order value resurrected between check and write.
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.marketplaceListing.findMany({
        where: FEATURED_LISTING_WHERE,
        select: { id: true },
      });
      const currentIds = new Set(current.map((l) => l.id));
      const requestedIds = new Set(listingIds);
      if (
        currentIds.size !== requestedIds.size ||
        [...currentIds].some((id) => !requestedIds.has(id))
      ) {
        throw new BadRequestException(
          'listingIds must contain exactly the currently featured listings',
        );
      }

      for (const [index, id] of listingIds.entries()) {
        await tx.marketplaceListing.update({
          where: { id },
          data: { featuredOrder: index },
        });
      }
    });

    return this.adminListFeaturedListings();
  }

  // ── Item CRUD ──────────────────────────────────────────────────────

  async createItem(
    listingId: number,
    userId: number,
    dto: CreateMarketItemDto,
  ): Promise<MarketItemDto> {
    await this.assertListingOwner(listingId, userId);
    assertCoordinatePair(dto.latitude, dto.longitude);

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tripPlanMarketItem.create({
        data: {
          listingId,
          dayNumber: dto.dayNumber,
          title: dto.title,
          description: dto.description,
          location: dto.location,
          latitude: dto.latitude,
          longitude: dto.longitude,
          address: dto.address,
          startTime: dto.startTime,
          category: dto.category,
          imageUrls: (dto.imageUrls ?? []).map((u) =>
            this.storageService.extractObjectKey(u),
          ),
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      await this.flipStatusIfApproved(tx, listingId);
      await this.invalidateListingTranslations(tx, listingId);
      return created;
    });

    return this.formatItem(item);
  }

  async updateItem(
    listingId: number,
    itemId: number,
    userId: number,
    dto: UpdateMarketItemDto,
  ): Promise<MarketItemDto> {
    await this.assertListingOwner(listingId, userId);
    await this.assertItemBelongsToListing(itemId, listingId);
    assertCoordinatePatch(dto.latitude, dto.longitude);

    const data: Record<string, any> = {};
    if (dto.dayNumber !== undefined) data.dayNumber = dto.dayNumber;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.imageUrls !== undefined)
      data.imageUrls = dto.imageUrls.map((u) =>
        this.storageService.extractObjectKey(u),
      );
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const item = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tripPlanMarketItem.update({
        where: { id: itemId },
        data,
      });
      await this.flipStatusIfApproved(tx, listingId);
      if (dto.title !== undefined || dto.description !== undefined) {
        await tx.tripPlanMarketItemTranslation.deleteMany({
          where: { itemId },
        });
        await this.invalidateListingTranslations(tx, listingId);
      }
      return updated;
    });

    return this.formatItem(item);
  }

  async deleteItem(
    listingId: number,
    itemId: number,
    userId: number,
  ): Promise<void> {
    await this.assertListingOwner(listingId, userId);
    await this.assertItemBelongsToListing(itemId, listingId);

    await this.prisma.$transaction(async (tx) => {
      await tx.tripPlanMarketItem.delete({ where: { id: itemId } });
      await this.flipStatusIfApproved(tx, listingId);
      await this.invalidateListingTranslations(tx, listingId);
    });
  }

  // ── Acquisition ────────────────────────────────────────────────────

  async applyForListing(
    userId: number,
    listingId: number,
  ): Promise<MarketplaceAcquisitionDto> {
    const listing = await this.getApprovedListingForAcquisition(listingId);

    try {
      const acquisition = await this.prisma.$transaction(async (tx) => {
        return this.createAcquisitionSnapshot(tx, userId, listingId, listing);
      });

      return {
        id: acquisition.id,
        userId: acquisition.userId,
        listingId: acquisition.listingId,
        acquiredAt: acquisition.acquiredAt.toISOString(),
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('You have already acquired this listing');
      }
      throw e;
    }
  }

  async purchaseListing(
    userId: number,
    listingId: number,
    dto: PurchaseMarketplaceListingDto,
  ): Promise<MarketplaceAcquisitionDto> {
    const listing = await this.getApprovedListingForAcquisition(listingId);
    if (!listing.playProductId) {
      throw new BadRequestException(
        'Listing is not configured for Google Play purchase',
      );
    }
    const verifiedPurchase =
      await this.purchaseVerifier.verifyGooglePlayPurchase(
        { id: listing.id, playProductId: listing.playProductId },
        dto,
      );

    try {
      const acquisition = await this.prisma.$transaction(async (tx) => {
        return this.createAcquisitionSnapshot(tx, userId, listingId, listing, {
          transactionId: verifiedPurchase.orderId,
          paidAt: verifiedPurchase.purchaseTime,
        });
      });

      return {
        id: acquisition.id,
        userId: acquisition.userId,
        listingId: acquisition.listingId,
        acquiredAt: acquisition.acquiredAt.toISOString(),
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('You have already acquired this listing');
      }
      throw e;
    }
  }

  async getAppliedStatus(
    userId: number,
    listingId: number,
  ): Promise<MarketplaceAppliedStatusDto> {
    const record = await this.prisma.marketplaceAcquisition.findUnique({
      where: { userId_listingId: { userId, listingId } },
      select: { id: true, acquiredAt: true },
    });

    return {
      applied: !!record,
      acquisitionId: record?.id ?? null,
      acquiredAt: record?.acquiredAt.toISOString() ?? null,
    };
  }

  async listMyAcquisitions(
    userId: number,
  ): Promise<MarketplaceAcquisitionSummaryDto[]> {
    const acquisitions = await this.prisma.marketplaceAcquisition.findMany({
      where: { userId },
      include: ACQUISITION_SUMMARY_INCLUDE,
      orderBy: { acquiredAt: 'desc' },
    });

    const locations = await this.loadLocationNamesForAcquisitions(acquisitions);

    return Promise.all(
      acquisitions.map((a) => this.formatAcquisitionSummary(a, locations)),
    );
  }

  async getAcquisition(
    userId: number,
    acquisitionId: number,
  ): Promise<MarketplaceAcquisitionDetailDto> {
    const acquisition = await this.prisma.marketplaceAcquisition.findUnique({
      where: { id: acquisitionId },
      include: {
        ...ACQUISITION_SUMMARY_INCLUDE,
        items: {
          orderBy: [
            { dayNumber: Prisma.SortOrder.asc },
            { sortOrder: Prisma.SortOrder.asc },
            { id: Prisma.SortOrder.asc },
          ],
        },
      },
    });

    if (!acquisition || acquisition.userId !== userId) {
      throw new NotFoundException('Acquisition not found');
    }

    const locations = await this.loadLocationNamesForAcquisitions([
      acquisition,
    ]);
    const summary = await this.formatAcquisitionSummary(acquisition, locations);
    const items = await Promise.all(
      acquisition.items.map((item) => this.formatAcquisitionItem(item)),
    );

    return { ...summary, items };
  }

  async createTripFromListing(
    userId: number,
    listingId: number,
  ): Promise<TripDto> {
    const inviteCode = randomBytes(32).toString('hex');

    const { tripId, tripName, createdItemIds } = await this.prisma.$transaction(
      async (tx) => {
        // Prefer the buyer's acquisition — what you bought is what you keep.
        let acquisition = await tx.marketplaceAcquisition.findUnique({
          where: { userId_listingId: { userId, listingId } },
          include: {
            items: {
              orderBy: [
                { dayNumber: Prisma.SortOrder.asc },
                { sortOrder: Prisma.SortOrder.asc },
                { id: Prisma.SortOrder.asc },
              ],
            },
          },
        });

        if (!acquisition) {
          // First-time acquisition: snapshot the listing (in the requester's
          // locale) via the shared acquisition primitive. The APPROVED check
          // lives in getApprovedListingForAcquisition.
          const listing =
            await this.getApprovedListingForAcquisition(listingId);
          const created = await this.createAcquisitionSnapshot(
            tx,
            userId,
            listingId,
            listing,
          );
          acquisition = await tx.marketplaceAcquisition.findUniqueOrThrow({
            where: { id: created.id },
            include: {
              items: {
                orderBy: [
                  { dayNumber: Prisma.SortOrder.asc },
                  { sortOrder: Prisma.SortOrder.asc },
                  { id: Prisma.SortOrder.asc },
                ],
              },
            },
          });
        } else {
          // The frozen snapshot may predate the admin's latest edits. Refresh
          // it in place from the current approved listing; a missing/rejected/
          // deleted listing keeps the frozen copy (same as before).
          const listing =
            await this.findApprovedListingForAcquisition(listingId);
          if (
            listing &&
            (await this.acquisition.refreshAcquisitionSnapshotIfStale(
              tx,
              acquisition,
              listing,
              this.requestLocale(),
            ))
          ) {
            acquisition = await tx.marketplaceAcquisition.findUniqueOrThrow({
              where: { id: acquisition.id },
              include: {
                items: {
                  orderBy: [
                    { dayNumber: Prisma.SortOrder.asc },
                    { sortOrder: Prisma.SortOrder.asc },
                    { id: Prisma.SortOrder.asc },
                  ],
                },
              },
            });
          }
        }

        const trip = await tx.trip.create({
          data: {
            name: acquisition.snapshotName,
            cityId: acquisition.snapshotCityId,
            stateId: acquisition.snapshotStateId,
            countryId: acquisition.snapshotCountryId,
            createdById: userId,
            inviteCode,
            marketplaceListingId: listingId,
          },
        });

        await tx.tripMember.create({
          data: {
            tripId: trip.id,
            userId,
            inviteStatus: InviteStatus.ACCEPTED,
            joinedAt: new Date(),
          },
        });

        const itemIds: number[] = [];
        for (const mi of acquisition.items) {
          const created = await tx.tripPlanItem.create({
            data: {
              tripId: trip.id,
              title: mi.title,
              description: mi.description,
              location: mi.location,
              latitude: mi.latitude,
              longitude: mi.longitude,
              address: mi.address,
              startTime: mi.startTime,
              category: mi.category,
              sortOrder: mi.sortOrder,
              dayNumber: mi.dayNumber,
              planDate: null,
              voiceUrl: null,
              voiceDuration: null,
            },
          });
          itemIds.push(created.id);

          await tx.tripPlanItemMember.create({
            data: { tripPlanItemId: created.id, userId },
          });
        }

        return {
          tripId: trip.id,
          tripName: acquisition.snapshotName,
          createdItemIds: itemIds,
        };
      },
    );

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.TRIP_CREATED,
      undefined,
      { name: tripName },
    );
    // Listing-created trips count for first_trip/streak like any other
    // creation path (no startDate at this point).
    void this.missions.onTripCreated(userId, tripId, null);

    if (createdItemIds.length > 0) {
      this.activityService.log(
        tripId,
        userId,
        ActivityAction.PLAN_ITEM_CREATED,
        createdItemIds[0],
        { title: `Applied marketplace listing #${listingId}` },
      );
      // "New trip" from a listing is a plan apply too — same apply_plan
      // mission as applying into an existing trip (plan-items).
      void this.missions.onPlanApplied(userId);
    }

    return this.tripsService.findTripDetail(tripId, userId);
  }

  // ── Ratings ────────────────────────────────────────────────────────

  async rateListing(
    userId: number,
    listingId: number,
    dto: CreateMarketplaceRatingDto,
  ): Promise<MarketplaceRatingResponseDto> {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { id: true },
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    const acquisition = await this.prisma.marketplaceAcquisition.findUnique({
      where: { userId_listingId: { userId, listingId } },
      select: { id: true },
    });
    if (!acquisition) {
      throw new ForbiddenException(
        'You must acquire this listing before rating it',
      );
    }

    const eligibleTrip = await this.prisma.trip.findFirst({
      where: {
        marketplaceListingId: listingId,
        status: TripStatus.ENDED,
        OR: [
          { createdById: userId },
          {
            members: {
              some: { userId, inviteStatus: InviteStatus.ACCEPTED },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!eligibleTrip) {
      throw new ForbiddenException(
        'Can only rate after an applied trip has ended',
      );
    }

    const saved = await this.prisma.marketplaceRating.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId, rating: dto.rating },
      update: { rating: dto.rating },
      select: { rating: true },
    });

    // rate_plan (3/week, deduped per listing so re-rating never re-pays).
    // Eligibility (acquired + ended trip) was already enforced above.
    void this.missions.onListingRated(userId, listingId);

    const stats = await this.fetchRatingStatsForListing(listingId);

    return {
      userRating: saved.rating,
      averageRating: this.formatAverageRating(stats.avg, stats.count),
      ratingCount: stats.count,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────

  // Acquisition lookup/snapshot live in MarketplaceAcquisitionService (shared
  // with MissionsModule for the market_unlock redemption).
  private getApprovedListingForAcquisition(listingId: number) {
    return this.acquisition.getApprovedListingForAcquisition(listingId);
  }

  private findApprovedListingForAcquisition(listingId: number) {
    return this.acquisition.findApprovedListingForAcquisition(listingId);
  }

  private createAcquisitionSnapshot(
    tx: Prisma.TransactionClient,
    userId: number,
    listingId: number,
    listing: AcquirableListing,
    payment?: {
      transactionId: string | null;
      paidAt: Date | null;
    },
  ) {
    return this.acquisition.createAcquisitionSnapshot(
      tx,
      userId,
      listingId,
      listing,
      payment,
      this.requestLocale(),
    );
  }

  private normalizeMarketplaceFeedTake(take?: number): number {
    if (take === undefined) return MARKETPLACE_FEED_DEFAULT_TAKE;
    return Math.min(Math.max(take, 1), MARKETPLACE_FEED_MAX_TAKE);
  }

  // Item edits on an approved listing send it back to review. Inside a
  // transaction with the item write — otherwise there is a window where the
  // feed serves the updated item before the status flips.
  private async flipStatusIfApproved(
    tx: Prisma.TransactionClient,
    listingId: number,
  ): Promise<void> {
    await tx.marketplaceListing.updateMany({
      where: { id: listingId, status: MarketplaceListingStatus.APPROVED },
      data: {
        status: MarketplaceListingStatus.PENDING_REVIEW,
        featuredAt: null,
        featuredOrder: null,
      },
    });
  }

  // Item add/edit/remove makes the listing-level translation set incomplete
  // (a locale would be reported as available while an item has no row), so
  // the whole listing is marked untranslated and regenerated by the admin.
  private async invalidateListingTranslations(
    tx: Prisma.TransactionClient,
    listingId: number,
  ): Promise<void> {
    await tx.marketplaceListingTranslation.deleteMany({
      where: { listingId },
    });
  }

  private async formatMarketplaceFeedItem(
    listing: {
      id: number;
      createdById: number;
      name: string;
      description: string | null;
      sourceLocale: ContentLocale;
      translations?: Array<{
        locale: ContentLocale;
        name: string;
        description: string | null;
      }>;
      createdBy: { displayName: string; avatarUrl: string | null };
      coverImageUrl: string | null;
      price: Prisma.Decimal;
      currency: Currency;
      tags: ListingTag[];
      city: { name: string } | null;
      state: { name: string } | null;
      country: { name: string } | null;
      durationDays: number;
      createdAt: Date;
      _count: { acquisitions: number; items: number };
    },
    acquired: boolean = false,
    stats: ListingRatingStats = EMPTY_RATING_STATS,
    locale: ContentLocale | null = null,
  ): Promise<MarketplaceFeedItemDto> {
    const [coverImageUrl, creatorAvatarUrl] = await Promise.all([
      this.resolveMediaUrlOrPassThrough(listing.coverImageUrl),
      this.resolveMediaUrlOrPassThrough(listing.createdBy.avatarUrl),
    ]);

    return {
      id: listing.id,
      createdById: listing.createdById,
      name: pickListingText(listing, locale).name,
      creatorName: listing.createdBy.displayName,
      creatorAvatarUrl,
      coverImageUrl,
      price: listing.price.toString(),
      currency: listing.currency,
      tags: listing.tags,
      cityName: listing.city?.name ?? null,
      stateName: listing.state?.name ?? null,
      countryName: listing.country?.name ?? null,
      durationDays: listing.durationDays,
      activityCount: listing._count.items,
      appliedCount: listing._count.acquisitions,
      averageRating: this.formatAverageRating(stats.avg, stats.count),
      ratingCount: stats.count,
      acquired,
      createdAt: listing.createdAt.toISOString(),
    };
  }

  private async loadGlobalDestinationNames(): Promise<string[]> {
    const rows = await this.prisma.marketplaceListing.findMany({
      where: PUBLIC_LISTING_WHERE,
      select: {
        city: { select: { name: true } },
        state: { select: { name: true } },
        country: { select: { name: true } },
      },
    });
    const set = new Set<string>();
    for (const row of rows) {
      const name = row.city?.name ?? row.state?.name ?? row.country?.name;
      if (name) set.add(name);
    }
    return Array.from(set);
  }

  private async sortFeedCandidates(
    candidates: Array<{ id: number; price: Prisma.Decimal; createdAt: Date }>,
    tab: MarketplaceFeedTab,
    budgetSort: SortDirection | undefined,
  ): Promise<number[]> {
    if (budgetSort) {
      const dir = budgetSort === SortDirection.ASC ? 1 : -1;
      return [...candidates]
        .sort((a, b) => {
          const priceDelta = a.price.comparedTo(b.price) * dir;
          if (priceDelta !== 0) return priceDelta;
          return b.createdAt.getTime() - a.createdAt.getTime();
        })
        .map((c) => c.id);
    }

    const ids = candidates.map((c) => c.id);

    if (tab === MarketplaceFeedTab.TOP_RATED) {
      const stats = await this.fetchRatingStatsByListing(ids);
      return [...candidates]
        .sort((a, b) => {
          const aStats = stats.get(a.id) ?? EMPTY_RATING_STATS;
          const bStats = stats.get(b.id) ?? EMPTY_RATING_STATS;
          const aAvg = aStats.avg;
          const bAvg = bStats.avg;
          if (aAvg === null && bAvg === null) {
            // both unrated — fall through to count/createdAt
          } else if (aAvg === null) {
            return 1;
          } else if (bAvg === null) {
            return -1;
          } else if (aAvg !== bAvg) {
            return bAvg - aAvg;
          }
          if (aStats.count !== bStats.count) {
            return bStats.count - aStats.count;
          }
          return b.createdAt.getTime() - a.createdAt.getTime();
        })
        .map((c) => c.id);
    }

    // Default: TRENDING — recent acquisition count within the window.
    const counts = await this.fetchRecentAcquisitionCounts(ids);
    return [...candidates]
      .sort((a, b) => {
        const aCount = counts.get(a.id) ?? 0;
        const bCount = counts.get(b.id) ?? 0;
        if (aCount !== bCount) return bCount - aCount;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .map((c) => c.id);
  }

  private async fetchRecentAcquisitionCounts(
    listingIds: number[],
  ): Promise<Map<number, number>> {
    if (listingIds.length === 0) return new Map();

    const windowDays = this.config.get<number>(
      'MARKETPLACE_TRENDING_WINDOW_DAYS',
      30,
    );
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.marketplaceAcquisition.groupBy({
      by: ['listingId'],
      where: {
        listingId: { in: listingIds },
        acquiredAt: { gte: windowStart },
      },
      _count: { _all: true },
    });

    return new Map(
      rows
        .filter(
          (r): r is typeof r & { listingId: number } => r.listingId !== null,
        )
        .map((r) => [r.listingId, r._count._all]),
    );
  }

  private async assertListingOwner(
    listingId: number,
    userId: number,
  ): Promise<void> {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { createdById: true, deletedAt: true },
    });

    if (!listing || listing.deletedAt !== null) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.createdById !== userId) {
      throw new ForbiddenException(
        'Only the listing creator can perform this action',
      );
    }
  }

  private async assertItemBelongsToListing(
    itemId: number,
    listingId: number,
  ): Promise<void> {
    const item = await this.prisma.tripPlanMarketItem.findUnique({
      where: { id: itemId },
      select: { listingId: true },
    });

    if (!item || item.listingId !== listingId) {
      throw new NotFoundException('Market item not found');
    }
  }

  private async formatListing(
    listing: {
      id: number;
      publicId: string;
      createdById: number;
      status: MarketplaceListingStatus;
      createdBy: { displayName: string; avatarUrl: string | null };
      name: string;
      description: string | null;
      sourceLocale: ContentLocale;
      translations?: Array<{
        locale: ContentLocale;
        name: string;
        description: string | null;
      }>;
      coverImageUrl: string | null;
      playProductId: string | null;
      city: { id: number; name: string } | null;
      state: { id: number; name: string } | null;
      country: { id: number; name: string } | null;
      price: Prisma.Decimal;
      currency: Currency;
      durationDays: number;
      tags: ListingTag[];
      createdAt: Date;
      updatedAt: Date;
      items: Array<any>;
      _count: { acquisitions: number };
    },
    stats: ListingRatingStats = EMPTY_RATING_STATS,
    // null → base text. Only public read paths pass the request locale.
    locale: ContentLocale | null = null,
  ): Promise<MarketplaceListingDto> {
    const textCtx = { sourceLocale: listing.sourceLocale, locale };
    const [coverImageUrl, creatorAvatarUrl, items] = await Promise.all([
      this.resolveMediaUrlOrPassThrough(listing.coverImageUrl),
      this.resolveMediaUrlOrPassThrough(listing.createdBy.avatarUrl),
      Promise.all(listing.items.map((item) => this.formatItem(item, textCtx))),
    ]);
    const text = pickListingText(listing, locale);

    return {
      id: listing.id,
      publicId: listing.publicId,
      status: listing.status,
      createdById: listing.createdById,
      creatorName: listing.createdBy.displayName,
      creatorAvatarUrl,
      name: text.name,
      description: text.description,
      sourceLocale: listing.sourceLocale,
      availableLocales: availableLocales(listing),
      coverImageUrl,
      cityId: listing.city?.id ?? null,
      stateId: listing.state?.id ?? null,
      countryId: listing.country?.id ?? null,
      cityName: listing.city?.name ?? null,
      stateName: listing.state?.name ?? null,
      countryName: listing.country?.name ?? null,
      price: listing.price.toString(),
      currency: listing.currency,
      durationDays: listing.durationDays,
      playProductId: listing.playProductId,
      tags: listing.tags,
      appliedCount: listing._count.acquisitions,
      averageRating: this.formatAverageRating(stats.avg, stats.count),
      ratingCount: stats.count,
      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
      items,
    };
  }

  private async formatItem(
    item: {
      id: number;
      listingId: number;
      dayNumber: number;
      title: string;
      description: string | null;
      translations?: Array<{
        locale: ContentLocale;
        title: string;
        description: string | null;
      }>;
      location: string | null;
      latitude: number | null;
      longitude: number | null;
      address: string | null;
      startTime: string | null;
      category: any;
      imageUrls: string[];
      sortOrder: number;
      createdAt: Date;
    },
    // Omitted → base text (creator item CRUD responses).
    textCtx?: { sourceLocale: ContentLocale; locale: ContentLocale | null },
  ): Promise<MarketItemDto> {
    const imageUrls = await Promise.all(
      item.imageUrls.map((imageUrl) =>
        this.resolveRequiredMediaUrlOrPassThrough(imageUrl),
      ),
    );
    const text = textCtx
      ? pickItemText(item, textCtx.sourceLocale, textCtx.locale)
      : { title: item.title, description: item.description };

    return {
      id: item.id,
      listingId: item.listingId,
      dayNumber: item.dayNumber,
      title: text.title,
      description: text.description,
      location: item.location,
      latitude: item.latitude,
      longitude: item.longitude,
      address: item.address,
      startTime: item.startTime,
      category: item.category,
      imageUrls,
      sortOrder: item.sortOrder,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private async formatAcquisitionItem(item: {
    id: number;
    acquisitionId: number;
    dayNumber: number;
    title: string;
    description: string | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    startTime: string | null;
    category: any;
    imageUrls: string[];
    sortOrder: number;
    createdAt: Date;
  }): Promise<AcquisitionItemDto> {
    const imageUrls = await Promise.all(
      item.imageUrls.map((imageUrl) =>
        this.resolveRequiredMediaUrlOrPassThrough(imageUrl),
      ),
    );

    return {
      id: item.id,
      acquisitionId: item.acquisitionId,
      dayNumber: item.dayNumber,
      title: item.title,
      description: item.description,
      location: item.location,
      latitude: item.latitude,
      longitude: item.longitude,
      address: item.address,
      startTime: item.startTime,
      category: item.category,
      imageUrls,
      sortOrder: item.sortOrder,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private async loadLocationNamesForAcquisitions(
    acquisitions: Array<{
      snapshotCityId: number | null;
      snapshotStateId: number | null;
      snapshotCountryId: number | null;
    }>,
  ): Promise<LocationNames> {
    const cityIds = new Set<number>();
    const stateIds = new Set<number>();
    const countryIds = new Set<number>();
    for (const a of acquisitions) {
      if (a.snapshotCityId !== null) cityIds.add(a.snapshotCityId);
      if (a.snapshotStateId !== null) stateIds.add(a.snapshotStateId);
      if (a.snapshotCountryId !== null) countryIds.add(a.snapshotCountryId);
    }

    const [cities, states, countries] = await Promise.all([
      cityIds.size > 0
        ? this.prisma.city.findMany({
            where: { id: { in: Array.from(cityIds) } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      stateIds.size > 0
        ? this.prisma.state.findMany({
            where: { id: { in: Array.from(stateIds) } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      countryIds.size > 0
        ? this.prisma.country.findMany({
            where: { id: { in: Array.from(countryIds) } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      cities: new Map(cities.map((c) => [c.id, c.name])),
      states: new Map(states.map((s) => [s.id, s.name])),
      countries: new Map(countries.map((c) => [c.id, c.name])),
    };
  }

  private async formatAcquisitionSummary(
    acquisition: {
      id: number;
      listingId: number | null;
      snapshotName: string;
      snapshotDescription: string | null;
      snapshotCoverImageUrl: string | null;
      snapshotPrice: Prisma.Decimal;
      snapshotCurrency: Currency;
      snapshotDurationDays: number;
      snapshotTags: ListingTag[];
      snapshotCityId: number | null;
      snapshotStateId: number | null;
      snapshotCountryId: number | null;
      snapshotCreatorName: string;
      snapshotCreatorAvatarUrl: string | null;
      acquiredAt: Date;
      listing: {
        status: MarketplaceListingStatus;
        deletedAt: Date | null;
      } | null;
      _count: { items: number };
    },
    locations: LocationNames,
  ): Promise<MarketplaceAcquisitionSummaryDto> {
    const [coverImageUrl, creatorAvatarUrl] = await Promise.all([
      this.resolveMediaUrlOrPassThrough(acquisition.snapshotCoverImageUrl),
      this.resolveMediaUrlOrPassThrough(acquisition.snapshotCreatorAvatarUrl),
    ]);

    const listingStillAvailable =
      acquisition.listing !== null &&
      acquisition.listing.deletedAt === null &&
      acquisition.listing.status === MarketplaceListingStatus.APPROVED;

    return {
      acquisitionId: acquisition.id,
      listingId: acquisition.listingId,
      name: acquisition.snapshotName,
      description: acquisition.snapshotDescription,
      coverImageUrl,
      price: acquisition.snapshotPrice.toString(),
      currency: acquisition.snapshotCurrency,
      tags: acquisition.snapshotTags,
      durationDays: acquisition.snapshotDurationDays,
      activityCount: acquisition._count.items,
      creatorName: acquisition.snapshotCreatorName,
      creatorAvatarUrl,
      cityId: acquisition.snapshotCityId,
      stateId: acquisition.snapshotStateId,
      countryId: acquisition.snapshotCountryId,
      cityName:
        acquisition.snapshotCityId !== null
          ? (locations.cities.get(acquisition.snapshotCityId) ?? null)
          : null,
      stateName:
        acquisition.snapshotStateId !== null
          ? (locations.states.get(acquisition.snapshotStateId) ?? null)
          : null,
      countryName:
        acquisition.snapshotCountryId !== null
          ? (locations.countries.get(acquisition.snapshotCountryId) ?? null)
          : null,
      acquiredAt: acquisition.acquiredAt.toISOString(),
      listingStillAvailable,
    };
  }

  private async resolveMediaUrlOrPassThrough(
    value: string | null,
  ): Promise<string | null> {
    if (!value) return null;

    const objectKey = this.storageService.extractObjectKey(value);
    if (/^https?:\/\//i.test(objectKey)) return value;

    // If the value was an absolute URL pointing somewhere other than our
    // storage bucket, extractObjectKey returns it unchanged. In that case we
    // pass through — signing would generate a bogus signed URL for an object
    // key that doesn't exist in our bucket.
    if (/^https?:\/\//i.test(objectKey)) return objectKey;

    try {
      const { url } = await this.storageService.getSignedThumbUrl(objectKey);
      return url;
    } catch {
      return value;
    }
  }

  private async resolveRequiredMediaUrlOrPassThrough(
    value: string,
  ): Promise<string> {
    const resolved = await this.resolveMediaUrlOrPassThrough(value);
    return resolved ?? value;
  }

  private async fetchRatingStatsByListing(
    listingIds: number[],
  ): Promise<Map<number, ListingRatingStats>> {
    if (listingIds.length === 0) {
      return new Map();
    }

    const stats = await this.prisma.marketplaceRating.groupBy({
      by: ['listingId'],
      where: { listingId: { in: listingIds } },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return new Map(
      stats.map((s) => [
        s.listingId,
        {
          avg: s._avg.rating,
          count: s._count._all,
        },
      ]),
    );
  }

  private async fetchRatingStatsForListing(
    listingId: number,
  ): Promise<ListingRatingStats> {
    const agg = await this.prisma.marketplaceRating.aggregate({
      where: { listingId },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return {
      avg: agg._avg.rating,
      count: agg._count._all,
    };
  }

  private formatAverageRating(
    avg: number | null,
    count: number,
  ): string | null {
    if (count === 0 || avg === null || avg === undefined) {
      return null;
    }
    return Number(avg).toFixed(1);
  }
}
