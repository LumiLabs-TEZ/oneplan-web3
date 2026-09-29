import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContentLocale,
  EngagementLocale,
  EngagementTrigger,
  MarketplaceListingStatus,
} from '@prisma/client';
import { pickListingText } from '../../marketplace/listing-text';
import { PrismaService } from '../../prisma/prisma.service';
import { ENGAGEMENT_PUSH_TYPE } from '../engagement.constants';
import {
  TriggerCandidate,
  TriggerEvaluator,
  UserEngagementContext,
} from '../engagement.types';

const DAY_MS = 24 * 60 * 60 * 1000;

// Push copy locale → marketplace content locale (VN is a country code).
const CONTENT_LOCALE_FOR: Record<EngagementLocale, ContentLocale> = {
  [EngagementLocale.EN]: ContentLocale.en,
  [EngagementLocale.VN]: ContentLocale.vi,
};

/**
 * Surfaces a fresh, relevant marketplace plan for a user's trip destination
 * that they haven't acquired. Highest priority (most actionable/commercial).
 * Keyed per listing per user.
 */
@Injectable()
export class NewPlanEvaluator implements TriggerEvaluator {
  readonly trigger = EngagementTrigger.NEW_PLAN_AVAILABLE;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('ENGAGEMENT_TRIGGER_NEW_PLAN') === 'true';
  }

  async evaluate(
    ctx: UserEngagementContext,
    now: Date,
  ): Promise<TriggerCandidate | null> {
    const lookbackDays =
      this.config.get<number>('ENGAGEMENT_NEW_PLAN_LOOKBACK_DAYS') ?? 14;
    const since = new Date(now.getTime() - lookbackDays * DAY_MS);

    // Distinct city ids across the user's active trips.
    const cityIds = [
      ...new Set(
        ctx.trips.map((t) => t.cityId).filter((id): id is number => id != null),
      ),
    ];
    if (cityIds.length === 0) return null;

    const listing = await this.prisma.marketplaceListing.findFirst({
      where: {
        status: MarketplaceListingStatus.APPROVED,
        deletedAt: null,
        cityId: { in: cityIds },
        createdAt: { gte: since },
        createdById: { not: ctx.userId },
        acquisitions: { none: { userId: ctx.userId } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        sourceLocale: true,
        translations: {
          select: { locale: true, name: true, description: true },
        },
        cityId: true,
        city: { select: { name: true } },
      },
    });
    if (!listing) return null;

    const cityName =
      listing.city?.name ??
      ctx.trips.find((t) => t.cityId === listing.cityId)?.cityName ??
      undefined;

    return {
      trigger: this.trigger,
      listingId: listing.id,
      dedupeKey: `NEW_PLAN_AVAILABLE:listing:${listing.id}:user:${ctx.userId}`,
      hints: {
        cityName,
        // Quote the plan name in the language the push copy will be in.
        listingName: pickListingText(listing, CONTENT_LOCALE_FOR[ctx.locale])
          .name,
        coarseHint: `listing:${listing.id}`,
      },
      deepLink: {
        type: ENGAGEMENT_PUSH_TYPE.NEW_PLAN_AVAILABLE,
        listingId: listing.id,
      },
    };
  }
}
