import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GeminiService } from '../../common/gemini/gemini.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketplaceTranslationService } from './marketplace-translation.service';

describe('MarketplaceTranslationService', () => {
  let service: MarketplaceTranslationService;
  let prisma: any;
  let gemini: { generateJsonFromText: jest.Mock };

  const baseListing = () => ({
    id: 1,
    deletedAt: null,
    sourceLocale: 'vi',
    name: 'Đà Lạt',
    description: 'Mô tả',
    translations: [],
    items: [
      {
        id: 10,
        dayNumber: 1,
        sortOrder: 0,
        title: 'Cà phê',
        description: null,
        translations: [],
      },
      {
        id: 11,
        dayNumber: 1,
        sortOrder: 1,
        title: 'Ăn trưa',
        description: 'Bún bò',
        translations: [],
      },
    ],
  });

  beforeEach(() => {
    prisma = {
      marketplaceListing: {
        findUnique: jest.fn().mockResolvedValue(baseListing()),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      marketplaceListingTranslation: { upsert: jest.fn() },
      tripPlanMarketItemTranslation: { upsert: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    gemini = { generateJsonFromText: jest.fn() };
    service = new MarketplaceTranslationService(
      prisma as PrismaService,
      gemini as unknown as GeminiService,
    );
  });

  it('getTranslations returns base text, translations and items', async () => {
    const dto = await service.getTranslations(1);
    expect(dto.sourceLocale).toBe('vi');
    expect(dto.name).toBe('Đà Lạt');
    expect(dto.items.map((i) => i.itemId)).toEqual([10, 11]);
  });

  it('getTranslations throws NotFound for deleted listings', async () => {
    prisma.marketplaceListing.findUnique.mockResolvedValue({
      ...baseListing(),
      deletedAt: new Date(),
    });
    await expect(service.getTranslations(1)).rejects.toThrow(NotFoundException);
  });

  it('upsertTranslation rejects the source locale', async () => {
    await expect(
      service.upsertTranslation(1, { locale: 'vi', name: 'x', items: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('upsertTranslation rejects items from another listing', async () => {
    await expect(
      service.upsertTranslation(1, {
        locale: 'en',
        name: 'Da Lat',
        items: [{ itemId: 999, title: 'Nope' }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('upsertTranslation writes only translation tables (status untouched)', async () => {
    await service.upsertTranslation(1, {
      locale: 'en',
      name: 'Da Lat',
      description: null,
      items: [{ itemId: 10, title: 'Coffee' }],
    });
    expect(prisma.marketplaceListingTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { listingId_locale: { listingId: 1, locale: 'en' } },
        create: {
          listingId: 1,
          locale: 'en',
          name: 'Da Lat',
          description: null,
        },
      }),
    );
    expect(prisma.tripPlanMarketItemTranslation.upsert).toHaveBeenCalledTimes(
      1,
    );
    expect(prisma.marketplaceListing.update).not.toHaveBeenCalled();
    expect(prisma.marketplaceListing.updateMany).not.toHaveBeenCalled();
  });

  it('generateTranslation maps Gemini output by id and stores it', async () => {
    gemini.generateJsonFromText.mockResolvedValue({
      listing: { name: '  Da Lat  ', description: '' },
      items: [
        { id: 11, title: 'Lunch', description: 'Beef noodle' },
        { id: 10, title: 'Coffee', description: '' },
      ],
    });

    await service.generateTranslation(1, 'en');

    const prompt: string = gemini.generateJsonFromText.mock.calls[0][0].prompt;
    expect(prompt).toContain('Vietnamese to English');
    expect(prisma.marketplaceListingTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { name: 'Da Lat', description: null },
      }),
    );
    const itemCalls =
      prisma.tripPlanMarketItemTranslation.upsert.mock.calls.map(
        (c: any[]) => c[0],
      );
    expect(itemCalls).toEqual([
      expect.objectContaining({
        where: { itemId_locale: { itemId: 10, locale: 'en' } },
        update: { title: 'Coffee', description: null },
      }),
      expect.objectContaining({
        where: { itemId_locale: { itemId: 11, locale: 'en' } },
        update: { title: 'Lunch', description: 'Beef noodle' },
      }),
    ]);
  });

  it('generateTranslation rejects output missing an item', async () => {
    gemini.generateJsonFromText.mockResolvedValue({
      listing: { name: 'Da Lat', description: '' },
      items: [{ id: 10, title: 'Coffee', description: '' }],
    });
    await expect(service.generateTranslation(1, 'en')).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(prisma.marketplaceListingTranslation.upsert).not.toHaveBeenCalled();
  });

  it('generateTranslation clamps over-long text to column limits', async () => {
    gemini.generateJsonFromText.mockResolvedValue({
      listing: { name: 'N'.repeat(300), description: 'D'.repeat(600) },
      items: [
        { id: 10, title: 'a', description: '' },
        { id: 11, title: 'b', description: '' },
      ],
    });
    await service.generateTranslation(1, 'en');
    const arg = prisma.marketplaceListingTranslation.upsert.mock.calls[0][0];
    expect(arg.update.name).toHaveLength(255);
    expect(arg.update.description).toHaveLength(500);
  });
});
