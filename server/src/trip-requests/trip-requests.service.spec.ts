import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ListingTag,
  MarketplaceListingStatus,
  TripRequestStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TripRequestsService } from './trip-requests.service';

describe('TripRequestsService', () => {
  let service: TripRequestsService;
  let prisma: {
    tripRequest: Record<string, jest.Mock>;
    marketplaceListing: Record<string, jest.Mock>;
  };
  let analytics: { track: jest.Mock };
  let notifications: { sendTripRequestFulfilledPush: jest.Mock };

  const baseEntity = {
    id: 1,
    userId: 7,
    cityId: 10,
    stateId: 20,
    countryId: 30,
    tag: ListingTag.FRIENDS,
    budget: null,
    currency: 'VND',
    participantCount: null,
    dayCount: null,
    description: null,
    status: TripRequestStatus.OPEN,
    createdAt: new Date('2026-06-11T00:00:00Z'),
    updatedAt: new Date('2026-06-11T00:00:00Z'),
    fulfilledByListingId: null,
    user: { displayName: 'Ken', email: 'ken@example.com' },
    city: { name: 'Da Lat' },
    state: { name: 'Lam Dong' },
    country: { name: 'Vietnam' },
    fulfilledByListing: null,
  };

  const approvedListing = {
    id: 55,
    status: MarketplaceListingStatus.APPROVED,
    deletedAt: null,
  };

  beforeEach(() => {
    prisma = {
      tripRequest: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      marketplaceListing: {
        findUnique: jest.fn(),
      },
    };
    analytics = { track: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      sendTripRequestFulfilledPush: jest.fn().mockResolvedValue(undefined),
    };
    service = new TripRequestsService(
      prisma as unknown as PrismaService,
      analytics as unknown as AnalyticsService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('create', () => {
    const dto = {
      cityId: 10,
      stateId: 20,
      countryId: 30,
      tag: ListingTag.FRIENDS,
      currency: 'VND' as const,
    };

    it('creates a request and tracks analytics', async () => {
      prisma.tripRequest.findFirst.mockResolvedValue(null);
      prisma.tripRequest.create.mockResolvedValue(baseEntity);

      const result = await service.create(7, dto);

      expect(result.id).toBe(1);
      expect(result.requesterName).toBe('Ken');
      expect(result.cityName).toBe('Da Lat');
      expect(analytics.track).toHaveBeenCalledWith(
        'TRIP_REQUEST_CREATED',
        expect.objectContaining({ userId: 7 }),
      );
    });

    it('persists participants, days and trimmed description and tracks them', async () => {
      prisma.tripRequest.findFirst.mockResolvedValue(null);
      prisma.tripRequest.create.mockResolvedValue({
        ...baseEntity,
        participantCount: 4,
        dayCount: 5,
        description: 'Beach trip with friends',
      });

      const result = await service.create(7, {
        ...dto,
        participantCount: 4,
        dayCount: 5,
        description: '  Beach trip with friends  ',
      });

      expect(prisma.tripRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            participantCount: 4,
            dayCount: 5,
            description: 'Beach trip with friends',
          }),
        }),
      );
      expect(result.participantCount).toBe(4);
      expect(result.dayCount).toBe(5);
      expect(result.description).toBe('Beach trip with friends');
      expect(analytics.track).toHaveBeenCalledWith(
        'TRIP_REQUEST_CREATED',
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          properties: expect.objectContaining({
            participantCount: 4,
            dayCount: 5,
            hasDescription: true,
          }),
        }),
      );
    });

    it('stores null instead of an empty/whitespace description', async () => {
      prisma.tripRequest.findFirst.mockResolvedValue(null);
      prisma.tripRequest.create.mockResolvedValue(baseEntity);

      await service.create(7, { ...dto, description: '   ' });

      expect(prisma.tripRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ description: undefined }),
        }),
      );
    });

    it('rejects when no destination id is provided', async () => {
      await expect(
        service.create(7, { tag: ListingTag.SOLO, currency: 'VND' as const }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tripRequest.create).not.toHaveBeenCalled();
    });

    it('throws 409 when an OPEN request exists for the same destination', async () => {
      prisma.tripRequest.findFirst.mockResolvedValue({ id: 99 });

      await expect(service.create(7, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.tripRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            userId: 7,
            status: TripRequestStatus.OPEN,
            cityId: 10,
            stateId: 20,
            countryId: 30,
          }),
        }),
      );
      expect(prisma.tripRequest.create).not.toHaveBeenCalled();
    });

    it('allows a new request when the prior one is not OPEN (dup check scoped to OPEN)', async () => {
      prisma.tripRequest.findFirst.mockResolvedValue(null);
      prisma.tripRequest.create.mockResolvedValue(baseEntity);

      await service.create(7, dto);

      expect(prisma.tripRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ status: TripRequestStatus.OPEN }),
        }),
      );
    });
  });

  describe('adminList', () => {
    it('filters by status and paginates', async () => {
      prisma.tripRequest.findMany.mockResolvedValue([baseEntity]);
      prisma.tripRequest.count.mockResolvedValue(1);

      const result = await service.adminList(TripRequestStatus.OPEN, 2, 25);

      expect(prisma.tripRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: TripRequestStatus.OPEN },
          skip: 25,
          take: 25,
        }),
      );
      expect(result.total).toBe(1);
      expect(result.items[0].requesterEmail).toBe('ken@example.com');
    });

    it('lists all statuses when no filter given', async () => {
      prisma.tripRequest.findMany.mockResolvedValue([]);
      prisma.tripRequest.count.mockResolvedValue(0);

      await service.adminList(undefined, 1, 50);

      expect(prisma.tripRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('adminFulfill', () => {
    it('throws 404 for unknown request id', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue(null);

      await expect(service.adminFulfill(123, 55)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 for missing or deleted listing', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 1 });
      prisma.marketplaceListing.findUnique.mockResolvedValue(null);

      await expect(service.adminFulfill(1, 55)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      prisma.marketplaceListing.findUnique.mockResolvedValue({
        ...approvedListing,
        deletedAt: new Date('2026-06-01T00:00:00Z'),
      });

      await expect(service.adminFulfill(1, 55)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });

    it('throws 400 when the listing is not APPROVED', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 1 });
      prisma.marketplaceListing.findUnique.mockResolvedValue({
        ...approvedListing,
        status: MarketplaceListingStatus.PENDING_REVIEW,
      });

      await expect(service.adminFulfill(1, 55)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });

    it('stores the listing id and pushes with it', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 1 });
      prisma.marketplaceListing.findUnique.mockResolvedValue(approvedListing);
      prisma.tripRequest.update.mockResolvedValue({
        ...baseEntity,
        status: TripRequestStatus.FULFILLED,
        fulfilledByListingId: 55,
        fulfilledByListing: { name: 'Da Lat Trip', publicId: 'abc123' },
      });

      const result = await service.adminFulfill(1, 55);

      expect(prisma.tripRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: TripRequestStatus.FULFILLED,
            fulfilledByListingId: 55,
          }),
        }),
      );
      expect(result.status).toBe(TripRequestStatus.FULFILLED);
      expect(result.fulfilledByListingId).toBe(55);
      expect(result.fulfilledByListingName).toBe('Da Lat Trip');
      expect(notifications.sendTripRequestFulfilledPush).toHaveBeenCalledWith(
        7,
        'Da Lat',
        55,
      );
    });
  });

  describe('adminReject', () => {
    it('throws 404 for unknown id', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue(null);

      await expect(service.adminReject(123)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('does not push on reject', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 1 });
      prisma.tripRequest.update.mockResolvedValue({
        ...baseEntity,
        status: TripRequestStatus.REJECTED,
      });

      const result = await service.adminReject(1);

      expect(result.status).toBe(TripRequestStatus.REJECTED);
      expect(notifications.sendTripRequestFulfilledPush).not.toHaveBeenCalled();
    });
  });
});
