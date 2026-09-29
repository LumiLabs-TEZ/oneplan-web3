import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityAction, ContentLocale, InviteStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { CONTENT_LOCALE_CLS_KEY } from '../common/locale/content-locale';
import { PrismaService } from '../prisma/prisma.service';
import { UploadTarget } from '../storage/constants/upload-targets';
import { StorageService } from '../storage/storage.service';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { MissionsService } from '../missions/missions.service';
import { MarketplaceAcquisitionService } from '../marketplace/acquisition/marketplace-acquisition.service';
import { ANALYTICS_EVENTS } from '../analytics/constants/events';
import { AddMembersDto } from './dto/add-members.dto';
import { CreatePlanItemDto } from './dto/create-plan-item.dto';
import { PlanItemDto } from './dto/plan-item.dto';
import { PlanItemMemberDto } from './dto/plan-item-member.dto';
import { UpdatePlanItemDto } from './dto/update-plan-item.dto';

const PLAN_ITEM_DETAIL_INCLUDE = {
  members: {
    include: {
      user: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  },
} as const;

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

@Injectable()
export class PlanItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: TripActivityService,
    private readonly storageService: StorageService,
    private readonly analytics: AnalyticsService,
    private readonly missions: MissionsService,
    private readonly marketplaceAcquisition: MarketplaceAcquisitionService,
    private readonly cls: ClsService,
  ) {}

  async createPlanItem(
    tripId: number,
    userId: number,
    dto: CreatePlanItemDto,
  ): Promise<PlanItemDto> {
    await this.assertMember(tripId, userId);
    assertCoordinatePair(dto.latitude, dto.longitude);

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tripPlanItem.create({
        data: {
          tripId,
          title: dto.title,
          planDate: dto.planDate ? new Date(dto.planDate) : null,
          dayNumber: dto.dayNumber ?? null,
          description: dto.description,
          location: dto.location,
          latitude: dto.latitude,
          longitude: dto.longitude,
          address: dto.address,
          startTime: dto.startTime,
          category: dto.category,
          voiceUrl: dto.voiceUrl,
          voiceDuration: dto.voiceDuration,
          imageUrls: this.normalizeImageKeys(dto.imageUrls ?? []),
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      const members = await tx.tripMember.findMany({
        where: {
          tripId,
          inviteStatus: InviteStatus.ACCEPTED,
          userId: { in: dto.userIds },
        },
      });
      const acceptedMemberIds = members.map((m) => m.userId);
      if (acceptedMemberIds.length === 0) {
        throw new BadRequestException(
          'No accepted trip members found in the provided list',
        );
      }

      await tx.tripPlanItemMember.createMany({
        data: acceptedMemberIds.map((uid) => ({
          tripPlanItemId: created.id,
          userId: uid,
        })),
      });

      return created;
    });

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.PLAN_ITEM_CREATED,
      item.id,
      {
        title: dto.title,
      },
    );

    return this.findItemDetail(item.id);
  }

  async listPlanItems(
    tripId: number,
    userId: number,
    planDate?: string,
    dayNumber?: number,
  ): Promise<PlanItemDto[]> {
    await this.assertMember(tripId, userId);

    const where: any = { tripId };
    if (planDate) {
      where.planDate = new Date(planDate);
    } else if (dayNumber) {
      where.dayNumber = dayNumber;
    }

    const items = await this.prisma.tripPlanItem.findMany({
      where,
      include: PLAN_ITEM_DETAIL_INCLUDE,
      orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });

    return Promise.all(items.map((item) => this.formatItem(item)));
  }

  async getPlanItem(
    tripId: number,
    itemId: number,
    userId: number,
  ): Promise<PlanItemDto> {
    await this.assertMember(tripId, userId);
    await this.assertItemBelongsToTrip(itemId, tripId);

    return this.findItemDetail(itemId);
  }

  async updatePlanItem(
    tripId: number,
    itemId: number,
    userId: number,
    dto: UpdatePlanItemDto,
  ): Promise<PlanItemDto> {
    await this.assertMember(tripId, userId);
    await this.assertItemBelongsToTrip(itemId, tripId);
    assertCoordinatePatch(dto.latitude, dto.longitude);

    const data: Record<string, any> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.planDate !== undefined) {
      data.planDate = dto.planDate ? new Date(dto.planDate) : null;
    }
    if (dto.description !== undefined)
      data.description = dto.description || null;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.category !== undefined) data.category = dto.category;
    let oldVoiceUrl: string | null = null;
    if (dto.voiceUrl !== undefined) {
      data.voiceUrl = dto.voiceUrl || null;
      if (!data.voiceUrl) {
        data.voiceDuration = null;
        // Fetch the old voice URL to delete from S3
        const existing = await this.prisma.tripPlanItem.findUnique({
          where: { id: itemId },
          select: { voiceUrl: true },
        });
        oldVoiceUrl = existing?.voiceUrl ?? null;
      }
    } else if (dto.voiceDuration !== undefined) {
      data.voiceDuration = dto.voiceDuration;
    }
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.dayNumber !== undefined) data.dayNumber = dto.dayNumber;
    // Full replace, like the marketplace item update. Keys are normalized so
    // signed (thumb) URLs echoed back by the client persist as original keys.
    // No S3 deletion here — removed originals are cleaned up on item delete.
    if (dto.imageUrls !== undefined) {
      data.imageUrls = this.normalizeImageKeys(dto.imageUrls);
    }

    if (dto.userIds !== undefined) {
      await this.validateMemberIds(tripId, dto.userIds);
      await this.prisma.$transaction(async (tx) => {
        await tx.tripPlanItem.update({ where: { id: itemId }, data });
        await tx.tripPlanItemMember.deleteMany({
          where: { tripPlanItemId: itemId },
        });
        await tx.tripPlanItemMember.createMany({
          data: dto.userIds!.map((uid) => ({
            tripPlanItemId: itemId,
            userId: uid,
          })),
        });
      });
    } else {
      await this.prisma.tripPlanItem.update({ where: { id: itemId }, data });
    }

    // Delete old voice file from S3 after successful DB update
    if (oldVoiceUrl) {
      await this.storageService.deleteObject(oldVoiceUrl);
    }

    const detail = await this.findItemDetail(itemId);
    this.activityService.log(
      tripId,
      userId,
      ActivityAction.PLAN_ITEM_UPDATED,
      itemId,
      {
        title: detail.title,
      },
    );

    return detail;
  }

  async deletePlanItem(
    tripId: number,
    itemId: number,
    userId: number,
  ): Promise<void> {
    await this.assertMember(tripId, userId);
    const planItem = await this.assertItemBelongsToTrip(itemId, tripId);

    await this.prisma.tripPlanItem.delete({ where: { id: itemId } });

    if (planItem.voiceUrl) {
      await this.storageService.deleteObject(planItem.voiceUrl);
    }
    for (const imageKey of planItem.imageUrls ?? []) {
      await this.storageService.deleteObject(imageKey);
    }

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.PLAN_ITEM_DELETED,
      itemId,
      {
        title: planItem.title,
      },
    );
  }

  async addPlanItemMembers(
    tripId: number,
    itemId: number,
    userId: number,
    dto: AddMembersDto,
  ): Promise<PlanItemMemberDto[]> {
    await this.assertMember(tripId, userId);
    await this.assertItemBelongsToTrip(itemId, tripId);
    await this.validateMemberIds(tripId, dto.userIds);

    await this.prisma.tripPlanItemMember.createMany({
      data: dto.userIds.map((uid) => ({
        tripPlanItemId: itemId,
        userId: uid,
      })),
      skipDuplicates: true,
    });

    const members = await this.prisma.tripPlanItemMember.findMany({
      where: { tripPlanItemId: itemId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    return members.map((m) => this.formatMember(m));
  }

  async removePlanItemMember(
    tripId: number,
    itemId: number,
    targetUserId: number,
    userId: number,
  ): Promise<void> {
    await this.assertMember(tripId, userId);
    await this.assertItemBelongsToTrip(itemId, tripId);

    try {
      await this.prisma.tripPlanItemMember.delete({
        where: {
          tripPlanItemId_userId: {
            tripPlanItemId: itemId,
            userId: targetUserId,
          },
        },
      });
    } catch {
      throw new NotFoundException('Member not found on this plan item');
    }
  }

  async applyAcquisitionToTrip(
    tripId: number,
    acquisitionId: number,
    userId: number,
  ): Promise<PlanItemDto[]> {
    await this.assertMember(tripId, userId);

    const acquisition = await this.prisma.marketplaceAcquisition.findUnique({
      where: { id: acquisitionId },
      include: {
        items: {
          orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!acquisition || acquisition.userId !== userId) {
      throw new NotFoundException('Acquisition not found');
    }
    if (acquisition.items.length === 0) {
      throw new NotFoundException('Acquired plan has no items');
    }

    if (acquisition.listingId !== null) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { marketplaceListingId: true },
      });
      if (trip?.marketplaceListingId === acquisition.listingId) {
        throw new ConflictException(
          'This plan is already applied to this trip.',
        );
      }
    }

    // The frozen snapshot may predate the admin's latest edits: refresh it in
    // place from the current approved listing before copying (a missing/
    // rejected/deleted listing keeps the frozen copy).
    let acquisitionItems = acquisition.items;
    if (acquisition.listingId !== null) {
      const listing =
        await this.marketplaceAcquisition.findApprovedListingForAcquisition(
          acquisition.listingId,
        );
      if (listing) {
        const refreshed = await this.prisma.$transaction((tx) =>
          this.marketplaceAcquisition.refreshAcquisitionSnapshotIfStale(
            tx,
            acquisition,
            listing,
            this.cls.get<ContentLocale | null>(CONTENT_LOCALE_CLS_KEY) ?? null,
          ),
        );
        if (refreshed) {
          acquisitionItems = await this.prisma.acquisitionItem.findMany({
            where: { acquisitionId: acquisition.id },
            orderBy: [
              { dayNumber: 'asc' },
              { sortOrder: 'asc' },
              { id: 'asc' },
            ],
          });
        }
      }
    }

    const acceptedMembers = await this.prisma.tripMember.findMany({
      where: { tripId, inviteStatus: InviteStatus.ACCEPTED },
      select: { userId: true },
    });
    const memberUserIds = acceptedMembers.map((m) => m.userId);

    // Copy snapshot images into trip-owned objects BEFORE the transaction.
    // The trip must not share keys with the marketplace: deletePlanItem
    // hard-deletes every image key, which would break the listing/snapshot.
    // A failed copy skips that image only — never fails the apply.
    const copiedImageKeysByItemId = new Map<number, string[]>();
    for (const mi of acquisitionItems) {
      const copiedKeys: string[] = [];
      for (const imageKey of (mi.imageUrls ?? []).slice(0, 5)) {
        try {
          copiedKeys.push(
            await this.storageService.copyToTarget(
              imageKey,
              UploadTarget.PLAN_ITEM_IMAGE,
              tripId,
            ),
          );
        } catch (error) {
          console.warn(
            `applyAcquisitionToTrip: image copy failed for ${imageKey}`,
            error,
          );
        }
      }
      if (copiedKeys.length > 0) {
        copiedImageKeysByItemId.set(mi.id, copiedKeys);
      }
    }

    const createdItemIds = await this.prisma.$transaction(async (tx) => {
      if (acquisition.listingId !== null) {
        await tx.trip.updateMany({
          where: { id: tripId, marketplaceListingId: null },
          data: { marketplaceListingId: acquisition.listingId },
        });
      }

      const ids: number[] = [];
      for (const mi of acquisitionItems) {
        const created = await tx.tripPlanItem.create({
          data: {
            tripId,
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
            imageUrls: copiedImageKeysByItemId.get(mi.id) ?? [],
          },
        });
        ids.push(created.id);

        if (memberUserIds.length > 0) {
          await tx.tripPlanItemMember.createMany({
            data: memberUserIds.map((uid) => ({
              tripPlanItemId: created.id,
              userId: uid,
            })),
          });
        }
      }
      return ids;
    });

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.PLAN_ITEM_CREATED,
      createdItemIds[0],
      { title: `Applied acquired plan #${acquisitionId}` },
    );

    void this.analytics.track(ANALYTICS_EVENTS.PLAN_APPLIED, {
      userId,
      properties: {
        tripId,
        acquisitionId,
        listingId: acquisition.listingId,
        itemCount: createdItemIds.length,
      },
    });
    void this.missions.onPlanApplied(userId);

    const items = await this.prisma.tripPlanItem.findMany({
      where: { id: { in: createdItemIds } },
      include: PLAN_ITEM_DETAIL_INCLUDE,
      orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });

    return Promise.all(items.map((item) => this.formatItem(item)));
  }

  async getLocationPlanCount(
    location: string,
  ): Promise<{ location: string; count: number }> {
    const count = await this.prisma.tripPlanItem.count({
      where: { location },
    });
    return { location, count };
  }

  async addMemberToAllPlanItems(tripId: number, userId: number): Promise<void> {
    const planItems = await this.prisma.tripPlanItem.findMany({
      where: { tripId },
      select: { id: true },
    });

    if (planItems.length === 0) return;

    await this.prisma.tripPlanItemMember.createMany({
      data: planItems.map((item) => ({
        tripPlanItemId: item.id,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async assertMember(tripId: number, userId: number): Promise<void> {
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });

    if (!member || member.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You are not a member of this trip');
    }
  }

  private async assertItemBelongsToTrip(
    itemId: number,
    tripId: number,
  ): Promise<{
    id: number;
    title: string;
    voiceUrl: string | null;
    imageUrls: string[];
  }> {
    const item = await this.prisma.tripPlanItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        title: true,
        tripId: true,
        voiceUrl: true,
        imageUrls: true,
      },
    });

    if (!item || item.tripId !== tripId) {
      throw new NotFoundException('Plan item not found');
    }

    return {
      id: item.id,
      title: item.title,
      voiceUrl: item.voiceUrl,
      imageUrls: item.imageUrls ?? [],
    };
  }

  private async validateMemberIds(
    tripId: number,
    userIds: number[],
    tx?: any,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const members = await client.tripMember.findMany({
      where: {
        tripId,
        userId: { in: userIds },
        inviteStatus: InviteStatus.ACCEPTED,
      },
    });

    const foundIds = new Set(members.map((m: any) => m.userId));
    const invalidIds = userIds.filter((id) => !foundIds.has(id));

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Invalid member IDs: ${invalidIds.join(', ')}`,
      );
    }
  }

  private async findItemDetail(itemId: number): Promise<PlanItemDto> {
    const item = await this.prisma.tripPlanItem.findUniqueOrThrow({
      where: { id: itemId },
      include: PLAN_ITEM_DETAIL_INCLUDE,
    });

    return this.formatItem(item);
  }

  /**
   * Strips submitted image values down to bare original object keys: signed
   * URLs are reduced to keys, and thumbnail keys (`<key>.thumb.webp` — what a
   * signed thumb URL from `formatItem` extracts back to) lose their suffix so
   * the DB always stores the original object key.
   */
  private normalizeImageKeys(values: string[]): string[] {
    const THUMB_SUFFIX = '.thumb.webp';
    return values.map((value) => {
      const key = this.storageService.extractObjectKey(value);
      return key.endsWith(THUMB_SUFFIX)
        ? key.slice(0, -THUMB_SUFFIX.length)
        : key;
    });
  }

  /** Signs stored image keys into ready-to-use (thumb) URLs for the DTO. */
  private async signImageUrls(keys: string[]): Promise<string[]> {
    return Promise.all(
      keys.map(async (key) => {
        // Legacy/foreign absolute URLs pass through unsigned.
        if (/^https?:\/\//i.test(key)) return key;
        try {
          const { url } = await this.storageService.getSignedThumbUrl(key);
          return url;
        } catch {
          return key;
        }
      }),
    );
  }

  private async formatItem(item: {
    id: number;
    tripId: number;
    planDate: Date | null;
    dayNumber: number | null;
    title: string;
    description: string | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    startTime: string | null;
    category: any;
    voiceUrl: string | null;
    voiceDuration: number | null;
    imageUrls: string[];
    sortOrder: number;
    createdAt: Date | null;
    members: Array<{
      id: number;
      userId: number;
      user: { id: number; displayName: string; avatarUrl: string | null };
    }>;
  }): Promise<PlanItemDto> {
    return {
      id: item.id,
      tripId: item.tripId,
      planDate: item.planDate?.toISOString().split('T')[0] ?? null,
      dayNumber: item.dayNumber,
      title: item.title,
      description: item.description,
      location: item.location,
      latitude: item.latitude,
      longitude: item.longitude,
      address: item.address,
      startTime: item.startTime,
      category: item.category,
      voiceUrl: item.voiceUrl,
      voiceDuration: item.voiceDuration,
      imageUrls: await this.signImageUrls(item.imageUrls ?? []),
      sortOrder: item.sortOrder,
      createdAt: item.createdAt?.toISOString() ?? new Date().toISOString(),
      members: item.members.map((m) => this.formatMember(m)),
    };
  }

  private formatMember(member: {
    id: number;
    userId: number;
    user: { id: number; displayName: string; avatarUrl: string | null };
  }): PlanItemMemberDto {
    return {
      id: member.id,
      userId: member.user.id,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl,
    };
  }
}
