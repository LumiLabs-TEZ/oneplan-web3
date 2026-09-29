import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AnalyticsEventName,
  MarketplaceListingStatus,
  TripRequestStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTripRequestDto } from './dto/create-trip-request.dto';
import {
  TripRequestDto,
  TripRequestEntity,
  tripRequestInclude,
} from './dto/trip-request.dto';

@Injectable()
export class TripRequestsService {
  private readonly logger = new Logger(TripRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    userId: number,
    dto: CreateTripRequestDto,
  ): Promise<TripRequestDto> {
    if (dto.cityId == null && dto.stateId == null && dto.countryId == null) {
      throw new BadRequestException(
        'At least one of cityId, stateId, countryId is required',
      );
    }

    const duplicate = await this.prisma.tripRequest.findFirst({
      where: {
        userId,
        status: TripRequestStatus.OPEN,
        cityId: dto.cityId ?? null,
        stateId: dto.stateId ?? null,
        countryId: dto.countryId ?? null,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'You already have an open request for this destination',
      );
    }

    const created = await this.prisma.tripRequest.create({
      data: {
        userId,
        cityId: dto.cityId,
        stateId: dto.stateId,
        countryId: dto.countryId,
        tag: dto.tag,
        budget: dto.budget,
        currency: dto.currency,
        participantCount: dto.participantCount,
        dayCount: dto.dayCount,
        description: dto.description?.trim() || undefined,
      },
      include: tripRequestInclude,
    });

    void this.analytics.track(AnalyticsEventName.TRIP_REQUEST_CREATED, {
      userId,
      properties: {
        tripRequestId: created.id,
        cityId: created.cityId,
        stateId: created.stateId,
        countryId: created.countryId,
        tag: created.tag,
        budget: created.budget?.toString() ?? null,
        currency: created.currency,
        participantCount: created.participantCount,
        dayCount: created.dayCount,
        hasDescription: created.description != null,
      },
    });

    return TripRequestDto.fromEntity(created);
  }

  async adminList(
    status: TripRequestStatus | undefined,
    page: number,
    pageSize: number,
  ): Promise<{ items: TripRequestDto[]; total: number }> {
    const where = status ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.tripRequest.findMany({
        where,
        include: tripRequestInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tripRequest.count({ where }),
    ]);
    return {
      items: rows.map((row) => TripRequestDto.fromEntity(row)),
      total,
    };
  }

  async adminFulfill(id: number, listingId: number): Promise<TripRequestDto> {
    const existing = await this.prisma.tripRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Trip request not found');

    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!listing || listing.deletedAt) {
      throw new NotFoundException('Marketplace listing not found');
    }
    if (listing.status !== MarketplaceListingStatus.APPROVED) {
      throw new BadRequestException(
        'Only an APPROVED marketplace listing can fulfill a trip request',
      );
    }

    const updated: TripRequestEntity = await this.prisma.tripRequest.update({
      where: { id },
      data: {
        status: TripRequestStatus.FULFILLED,
        fulfilledByListingId: listingId,
        updatedAt: new Date(),
      },
      include: tripRequestInclude,
    });

    const destinationName =
      updated.city?.name ??
      updated.state?.name ??
      updated.country?.name ??
      'your destination';
    this.notifications
      .sendTripRequestFulfilledPush(updated.userId, destinationName, listingId)
      .catch((error) =>
        this.logger.warn(
          `Failed to send trip request fulfilled push for request ${id}: ${error}`,
        ),
      );

    return TripRequestDto.fromEntity(updated);
  }

  async adminReject(id: number): Promise<TripRequestDto> {
    const existing = await this.prisma.tripRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Trip request not found');

    const updated: TripRequestEntity = await this.prisma.tripRequest.update({
      where: { id },
      data: { status: TripRequestStatus.REJECTED, updatedAt: new Date() },
      include: tripRequestInclude,
    });

    return TripRequestDto.fromEntity(updated);
  }
}
