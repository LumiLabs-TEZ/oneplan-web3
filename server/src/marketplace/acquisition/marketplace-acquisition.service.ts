import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ContentLocale,
  MarketplaceListingStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { pickItemText, pickListingText } from '../listing-text';

export type AcquirableListing = NonNullable<
  Awaited<
    ReturnType<
      MarketplaceAcquisitionService['findApprovedListingForAcquisition']
    >
  >
>;

/**
 * Newest change to anything a buyer sees: the listing row, its items, or any
 * translation row. Item edits bump only the item row, translation regeneration
 * only the translation row, so max() is the drift signal for snapshots.
 */
export function listingContentUpdatedAt(listing: AcquirableListing): Date {
  let latest = listing.updatedAt.getTime();
  for (const item of listing.items) {
    latest = Math.max(latest, item.updatedAt.getTime());
    for (const translation of item.translations) {
      latest = Math.max(latest, translation.updatedAt.getTime());
    }
  }
  for (const translation of listing.translations) {
    latest = Math.max(latest, translation.updatedAt.getTime());
  }
  return new Date(latest);
}

// Shared acquisition primitives, extracted from MarketplaceService so that
// MissionsModule (80⚡ market_unlock redemption) can create acquisitions
// without importing MarketplaceModule — marketplace itself imports missions
// for its mission triggers, so a direct dependency would be circular. Keeping
// the snapshot in ONE place also means a new snapshot field cannot silently
// diverge between the apply/purchase, mission-redeem and refresh paths.
@Injectable()
export class MarketplaceAcquisitionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load the live approved listing, or null when it is missing/deleted/not
   * APPROVED. Refresh callers use the null branch to keep the frozen snapshot.
   */
  async findApprovedListingForAcquisition(listingId: number) {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: {
        createdBy: { select: { displayName: true, avatarUrl: true } },
        translations: {
          select: {
            locale: true,
            name: true,
            description: true,
            updatedAt: true,
          },
        },
        items: {
          orderBy: [
            { dayNumber: Prisma.SortOrder.asc },
            { sortOrder: Prisma.SortOrder.asc },
            { id: Prisma.SortOrder.asc },
          ],
          include: {
            translations: {
              select: {
                locale: true,
                title: true,
                description: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (
      !listing ||
      listing.deletedAt !== null ||
      listing.status !== MarketplaceListingStatus.APPROVED
    ) {
      return null;
    }

    return listing;
  }

  async getApprovedListingForAcquisition(
    listingId: number,
  ): Promise<AcquirableListing> {
    const listing = await this.findApprovedListingForAcquisition(listingId);
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  async createAcquisitionSnapshot(
    tx: Prisma.TransactionClient,
    userId: number,
    listingId: number,
    listing: AcquirableListing,
    payment?: {
      transactionId: string | null;
      paidAt: Date | null;
    },
    // Snapshot text is frozen in the buyer's language (null → base text).
    locale: ContentLocale | null = null,
  ) {
    const created = await tx.marketplaceAcquisition.create({
      data: {
        userId,
        listingId,
        ...this.buildSnapshotFields(listing, locale),
        snapshotSourceUpdatedAt: listingContentUpdatedAt(listing),
      },
    });

    const items = this.buildSnapshotItems(created.id, listing, locale);
    if (items.length > 0) {
      await tx.acquisitionItem.createMany({ data: items });
    }

    if (payment) {
      await tx.marketplacePayment.create({
        data: {
          acquisitionId: created.id,
          amount: listing.price,
          currency: listing.currency,
          transactionId: payment.transactionId,
          paidAt: payment.paidAt,
        },
      });
    }

    return created;
  }

  /**
   * Rebuild an acquisition snapshot from a newer approved listing, in place
   * (same acquisition id, acquiredAt and payment untouched). Returns true when
   * the snapshot changed, so callers re-read the item rows.
   *
   * The conditional updateMany doubles as the row lock: concurrent refreshes
   * race for the claim and only the winner replaces the item rows.
   */
  async refreshAcquisitionSnapshotIfStale(
    tx: Prisma.TransactionClient,
    acquisition: {
      id: number;
      acquiredAt: Date;
      snapshotSourceUpdatedAt: Date | null;
    },
    listing: AcquirableListing,
    locale: ContentLocale | null = null,
  ): Promise<boolean> {
    const version = listingContentUpdatedAt(listing);
    const snapshotVersion =
      acquisition.snapshotSourceUpdatedAt ?? acquisition.acquiredAt;
    if (version.getTime() <= snapshotVersion.getTime()) return false;

    const claimed = await tx.marketplaceAcquisition.updateMany({
      where: {
        id: acquisition.id,
        OR: [
          { snapshotSourceUpdatedAt: null },
          { snapshotSourceUpdatedAt: { lt: version } },
        ],
      },
      data: {
        ...this.buildSnapshotFields(listing, locale),
        snapshotSourceUpdatedAt: version,
      },
    });
    if (claimed.count === 0) return false;

    await tx.acquisitionItem.deleteMany({
      where: { acquisitionId: acquisition.id },
    });
    const items = this.buildSnapshotItems(acquisition.id, listing, locale);
    if (items.length > 0) {
      await tx.acquisitionItem.createMany({ data: items });
    }
    return true;
  }

  private buildSnapshotFields(
    listing: AcquirableListing,
    locale: ContentLocale | null,
  ) {
    const text = pickListingText(listing, locale);
    return {
      snapshotName: text.name,
      snapshotDescription: text.description,
      snapshotCoverImageUrl: listing.coverImageUrl,
      snapshotPrice: listing.price,
      snapshotCurrency: listing.currency,
      snapshotDurationDays: listing.durationDays,
      snapshotTags: listing.tags,
      snapshotCityId: listing.cityId,
      snapshotStateId: listing.stateId,
      snapshotCountryId: listing.countryId,
      snapshotCreatorName: listing.createdBy.displayName,
      snapshotCreatorAvatarUrl: listing.createdBy.avatarUrl,
    };
  }

  private buildSnapshotItems(
    acquisitionId: number,
    listing: AcquirableListing,
    locale: ContentLocale | null,
  ) {
    return listing.items.map((mi) => ({
      acquisitionId,
      dayNumber: mi.dayNumber,
      ...pickItemText(mi, listing.sourceLocale, locale),
      location: mi.location,
      latitude: mi.latitude,
      longitude: mi.longitude,
      address: mi.address,
      startTime: mi.startTime,
      category: mi.category,
      imageUrls: mi.imageUrls,
      sortOrder: mi.sortOrder,
    }));
  }
}
