import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContentLocale, Prisma } from '@prisma/client';
import { GeminiService } from '../../common/gemini/gemini.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ListingTranslationsDto } from '../dto/listing-translations.dto';
import { UpsertListingTranslationDto } from '../dto/upsert-listing-translation.dto';

const NAME_MAX = 255;
const DESCRIPTION_MAX = 500;
const GEMINI_TIMEOUT_MS = 60_000;

const LANGUAGE_NAME: Record<ContentLocale, string> = {
  en: 'English',
  vi: 'Vietnamese',
};

type GeminiTranslation = {
  listing: { name: string; description: string };
  items: Array<{ id: number; title: string; description: string }>;
};

const TRANSLATION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  required: ['listing', 'items'],
  properties: {
    listing: {
      type: 'OBJECT',
      required: ['name', 'description'],
      properties: {
        name: { type: 'STRING' },
        description: { type: 'STRING' },
      },
    },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['id', 'title', 'description'],
        properties: {
          id: { type: 'INTEGER' },
          title: { type: 'STRING' },
          description: { type: 'STRING' },
        },
      },
    },
  },
};

const LISTING_WITH_TRANSLATIONS = {
  translations: {
    select: { locale: true, name: true, description: true },
    orderBy: { locale: Prisma.SortOrder.asc },
  },
  items: {
    orderBy: [
      { dayNumber: Prisma.SortOrder.asc },
      { sortOrder: Prisma.SortOrder.asc },
      { id: Prisma.SortOrder.asc },
    ],
    include: {
      translations: {
        select: { locale: true, title: true, description: true },
        orderBy: { locale: Prisma.SortOrder.asc },
      },
    },
  },
} satisfies Prisma.MarketplaceListingInclude;

/**
 * Admin/AI-authored translations of marketplace listing text.
 *
 * Writes touch ONLY the two translation tables — never `marketplace_listing`
 * (so an APPROVED listing stays approved and featured) and never the base
 * text columns.
 */
@Injectable()
export class MarketplaceTranslationService {
  private readonly logger = new Logger(MarketplaceTranslationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  async getTranslations(listingId: number): Promise<ListingTranslationsDto> {
    const listing = await this.loadListing(listingId);
    return {
      listingId: listing.id,
      sourceLocale: listing.sourceLocale,
      name: listing.name,
      description: listing.description,
      translations: listing.translations,
      items: listing.items.map((item) => ({
        itemId: item.id,
        dayNumber: item.dayNumber,
        sortOrder: item.sortOrder,
        title: item.title,
        description: item.description,
        translations: item.translations,
      })),
    };
  }

  async upsertTranslation(
    listingId: number,
    dto: UpsertListingTranslationDto,
  ): Promise<ListingTranslationsDto> {
    const listing = await this.loadListing(listingId);
    if (dto.locale === listing.sourceLocale) {
      throw new BadRequestException(
        `Listing text is already in "${dto.locale}"; edit the listing itself instead`,
      );
    }
    const itemIds = new Set(listing.items.map((i) => i.id));
    for (const item of dto.items) {
      if (!itemIds.has(item.itemId)) {
        throw new NotFoundException(
          `Market item ${item.itemId} does not belong to listing ${listingId}`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.marketplaceListingTranslation.upsert({
        where: { listingId_locale: { listingId, locale: dto.locale } },
        create: {
          listingId,
          locale: dto.locale,
          name: dto.name,
          description: dto.description ?? null,
        },
        update: { name: dto.name, description: dto.description ?? null },
      });
      for (const item of dto.items) {
        await tx.tripPlanMarketItemTranslation.upsert({
          where: { itemId_locale: { itemId: item.itemId, locale: dto.locale } },
          create: {
            itemId: item.itemId,
            locale: dto.locale,
            title: item.title,
            description: item.description ?? null,
          },
          update: {
            title: item.title,
            description: item.description ?? null,
          },
        });
      }
    });

    return this.getTranslations(listingId);
  }

  /** Translate the base text into `locale` with Gemini and store it. */
  async generateTranslation(
    listingId: number,
    locale: ContentLocale,
  ): Promise<ListingTranslationsDto> {
    const listing = await this.loadListing(listingId);
    if (locale === listing.sourceLocale) {
      throw new BadRequestException(`Listing text is already in "${locale}"`);
    }

    const payload = {
      listing: { name: listing.name, description: listing.description ?? '' },
      items: listing.items.map((i) => ({
        id: i.id,
        dayNumber: i.dayNumber,
        title: i.title,
        description: i.description ?? '',
      })),
    };

    const result = await this.gemini.generateJsonFromText<GeminiTranslation>({
      prompt: this.buildPrompt(listing.sourceLocale, locale, payload),
      responseSchema: TRANSLATION_RESPONSE_SCHEMA,
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      temperature: 0,
      thinkingBudget: 0,
      // 8192 truncated a 15-item Singapore listing (Gemini dropped the last
      // three items and the 422 blocked the whole translation). Flash allows
      // far more; descriptions run to 500 chars each.
      maxOutputTokens: 32768,
    });

    const byId = new Map<number, { title: string; description: string }>();
    for (const item of result.items ?? []) {
      if (byId.has(item.id)) {
        throw new UnprocessableEntityException(
          `Translation returned item ${item.id} more than once`,
        );
      }
      byId.set(item.id, item);
    }
    // Gemini sometimes returns the listing with the tail items missing
    // (Singapore #181: the last 3 of 15, deterministically, even with a
    // generous output cap). Ask once more for just those items and merge
    // instead of failing the whole translation.
    let missing = payload.items.filter((i) => !byId.has(i.id)).map((i) => i.id);
    if (missing.length > 0) {
      this.logger.warn(
        `Gemini translation of listing ${listingId} missed items ${missing.join(',')}; requesting them separately`,
      );
      const rest = await this.gemini.generateJsonFromText<GeminiTranslation>({
        prompt: this.buildPrompt(listing.sourceLocale, locale, {
          listing: payload.listing,
          items: payload.items.filter((i) => missing.includes(i.id)),
        }),
        responseSchema: TRANSLATION_RESPONSE_SCHEMA,
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        temperature: 0,
        thinkingBudget: 0,
        maxOutputTokens: 32768,
      });
      for (const item of rest.items ?? []) {
        if (missing.includes(item.id) && !byId.has(item.id)) {
          byId.set(item.id, item);
        }
      }
      missing = payload.items.filter((i) => !byId.has(i.id)).map((i) => i.id);
    }
    if (missing.length > 0) {
      this.logger.warn(
        `Gemini translation of listing ${listingId} still missing items ${missing.join(',')}`,
      );
      throw new UnprocessableEntityException(
        `Translation is missing items: ${missing.join(', ')}`,
      );
    }
    const name = clampText(result.listing?.name, NAME_MAX);
    if (!name) {
      throw new UnprocessableEntityException(
        'Translation returned an empty name',
      );
    }

    return this.upsertTranslation(listingId, {
      locale,
      name,
      description: clampText(result.listing.description, DESCRIPTION_MAX),
      items: payload.items.map((i) => {
        const t = byId.get(i.id)!;
        return {
          itemId: i.id,
          title: clampText(t.title, NAME_MAX) ?? i.title,
          description: clampText(t.description, DESCRIPTION_MAX),
        };
      }),
    });
  }

  private buildPrompt(
    from: ContentLocale,
    to: ContentLocale,
    payload: unknown,
  ): string {
    return [
      `You are a professional travel-content translator. Translate the trip plan below from ${LANGUAGE_NAME[from]} to ${LANGUAGE_NAME[to]}.`,
      '',
      'Rules:',
      '- Keep venue, dish, brand and place proper names exactly as written (you may add a short translated descriptor, e.g. "Bánh mì Huỳnh Hoa" → "Bánh mì Huỳnh Hoa (banh mi shop)").',
      '- Do not change numbers, times, prices, currencies, URLs, hashtags or emojis.',
      '- Keep the casual, friendly tone and roughly the same length. Do not add or remove information.',
      `- "name" and every "title" must be at most ${NAME_MAX} characters; every "description" at most ${DESCRIPTION_MAX} characters.`,
      '- If an input field is an empty string, return an empty string for it.',
      '- Return every item with the SAME "id" it was given, in the same order. Output JSON only.',
      '',
      'Input:',
      JSON.stringify(payload),
    ].join('\n');
  }

  private async loadListing(listingId: number) {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: LISTING_WITH_TRANSLATIONS,
    });
    if (!listing || listing.deletedAt !== null) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }
}

function clampText(
  value: string | undefined | null,
  max: number,
): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
