import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Currency, ExpenseCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../common/gemini/gemini.service';
import { StorageService } from '../storage/storage.service';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { TripsService } from '../trips/trips.service';
import { BoardService } from './board.service';
import { AddPinsToBoardDto } from './dto/add-pins-to-board.dto';
import { TripVibe } from './dto/generate-trip-from-board.dto';

import { AnalyticsService } from '../analytics/analytics.service';
import { MissionsService } from '../missions/missions.service';

// The AI-trip collaborators aren't exercised by the dedupe/update suites,
// so empty/fn stubs keep the constructor happy.
const noTrips = {} as unknown as TripsService;
const noActivity = {} as unknown as TripActivityService;
const noAnalytics = { track: jest.fn() } as unknown as AnalyticsService;
const noMissions = {
  onBoardCreated: jest.fn(),
  onTripCreated: jest.fn(),
} as unknown as MissionsService;

describe('BoardService.addPinsToBoard dedupe', () => {
  let board: { findUnique: jest.Mock; update: jest.Mock };
  let boardPin: {
    findMany: jest.Mock;
    aggregate: jest.Mock;
    createMany: jest.Mock;
  };
  let service: BoardService;

  const USER_ID = 42;
  const BOARD_ID = 7;

  beforeEach(() => {
    board = {
      findUnique: jest.fn().mockResolvedValue({
        id: BOARD_ID,
        userId: USER_ID,
        title: 'B',
        description: null,
        coverImageUrl: null,
        cityId: null,
        stateId: null,
        countryId: null,
        pins: [],
        city: null,
        state: null,
        country: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    boardPin = {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null } }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const prisma = { board, boardPin } as unknown as PrismaService;
    const storage = {
      getSignedThumbUrl: jest.fn(),
      deleteObject: jest.fn(),
    } as unknown as StorageService;
    const gemini = {
      generateText: jest.fn(),
    } as unknown as GeminiService;

    service = new BoardService(
      prisma,
      storage,
      gemini,
      noTrips,
      noActivity,
      noAnalytics,
      noMissions,
    );
  });

  const dto = (pins: unknown[]): AddPinsToBoardDto =>
    ({ pins }) as AddPinsToBoardDto;

  // addPinsToBoard returns the board; dedup is silent. We assert behavior via
  // what actually gets written: createMany is skipped entirely when nothing
  // new survives, otherwise it's called once with only the accepted rows.
  const createdRows = (): Array<{ sortOrder: number; name: string }> => {
    const calls = boardPin.createMany.mock.calls as Array<
      [{ data: Array<{ sortOrder: number; name: string }> }]
    >;
    return calls.length === 0 ? [] : calls[0][0].data;
  };
  const createdCount = (): number => createdRows().length;

  it('skips a pin with same name ~10m from an existing pin', async () => {
    boardPin.findMany.mockResolvedValue([
      { name: 'Cafe X', latitude: 10.0, longitude: 20.0 },
    ]);
    await service.addPinsToBoard(
      USER_ID,
      BOARD_ID,
      dto([{ name: 'Cafe X', latitude: 10.00005, longitude: 20.0 }]),
    );
    expect(createdCount()).toBe(0);
    expect(boardPin.createMany).not.toHaveBeenCalled();
    expect(board.update).not.toHaveBeenCalled();
  });

  it('adds a pin with same name but ~500m away (different venue)', async () => {
    boardPin.findMany.mockResolvedValue([
      { name: 'Cafe X', latitude: 10.0, longitude: 20.0 },
    ]);
    await service.addPinsToBoard(
      USER_ID,
      BOARD_ID,
      dto([{ name: 'Cafe X', latitude: 10.005, longitude: 20.0 }]),
    );
    expect(createdCount()).toBe(1);
  });

  it('skips accent + token-subset match at same coords', async () => {
    boardPin.findMany.mockResolvedValue([
      { name: 'Café Apartment', latitude: 10.0, longitude: 20.0 },
    ]);
    await service.addPinsToBoard(
      USER_ID,
      BOARD_ID,
      dto([{ name: 'Cafe Apartment 42', latitude: 10.0, longitude: 20.0 }]),
    );
    expect(createdCount()).toBe(0);
  });

  it('adds "Starbucks Reserve" near "Starbucks" (single-token guard)', async () => {
    boardPin.findMany.mockResolvedValue([
      { name: 'Starbucks', latitude: 10.0, longitude: 20.0 },
    ]);
    await service.addPinsToBoard(
      USER_ID,
      BOARD_ID,
      dto([{ name: 'Starbucks Reserve', latitude: 10.0003, longitude: 20.0 }]),
    );
    expect(createdCount()).toBe(1);
  });

  it('adds emoji-only pins (empty normalized name is never a dupe)', async () => {
    boardPin.findMany.mockResolvedValue([
      { name: '🔥', latitude: 10.0, longitude: 20.0 },
    ]);
    await service.addPinsToBoard(
      USER_ID,
      BOARD_ID,
      dto([{ name: '😀', latitude: 10.0, longitude: 20.0 }]),
    );
    expect(createdCount()).toBe(1);
  });

  it('skips exact normalized-name match when coords are missing', async () => {
    boardPin.findMany.mockResolvedValue([
      { name: 'Pizza Place', latitude: null, longitude: null },
    ]);
    await service.addPinsToBoard(
      USER_ID,
      BOARD_ID,
      dto([{ name: 'pizza place' }]),
    );
    expect(createdCount()).toBe(0);
  });

  it('adds "Pizza Hut" vs existing "Pizza" with no coords (no subset off-geo)', async () => {
    boardPin.findMany.mockResolvedValue([
      { name: 'Pizza', latitude: null, longitude: null },
    ]);
    await service.addPinsToBoard(
      USER_ID,
      BOARD_ID,
      dto([{ name: 'Pizza Hut' }]),
    );
    expect(createdCount()).toBe(1);
  });

  it('collapses duplicates within a single payload', async () => {
    await service.addPinsToBoard(
      USER_ID,
      BOARD_ID,
      dto([
        { name: 'Lake View', latitude: 1.0, longitude: 2.0 },
        { name: 'Lake View', latitude: 1.0, longitude: 2.0 },
      ]),
    );
    expect(createdCount()).toBe(1);
  });

  it('adds all-unique pins with sortOrder continuing from max', async () => {
    boardPin.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
    await service.addPinsToBoard(
      USER_ID,
      BOARD_ID,
      dto([
        { name: 'Alpha', latitude: 1.0, longitude: 2.0 },
        { name: 'Beta', latitude: 3.0, longitude: 4.0 },
      ]),
    );
    expect(createdRows().map((d) => d.sortOrder)).toEqual([5, 6]);
  });

  it('throws NotFound when the board does not exist', async () => {
    board.findUnique.mockResolvedValue(null);
    await expect(
      service.addPinsToBoard(USER_ID, BOARD_ID, dto([{ name: 'X' }])),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Forbidden when the caller does not own the board', async () => {
    board.findUnique.mockResolvedValue({ id: BOARD_ID, userId: 999 });
    await expect(
      service.addPinsToBoard(USER_ID, BOARD_ID, dto([{ name: 'X' }])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('BoardService.updateBoard', () => {
  let board: { findUnique: jest.Mock; update: jest.Mock };
  let service: BoardService;

  const USER_ID = 42;
  const BOARD_ID = 7;

  beforeEach(() => {
    board = {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: BOARD_ID, userId: USER_ID }),
      update: jest.fn().mockResolvedValue({
        id: BOARD_ID,
        title: 'New Title',
        description: 'New desc',
        coverImageUrl: null,
        cityId: 5,
        stateId: 6,
        countryId: 7,
        city: { name: 'Da Lat' },
        state: { name: 'Lam Dong' },
        country: { name: 'Vietnam' },
        _count: { pins: 3 },
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };
    const prisma = { board } as unknown as PrismaService;
    const storage = {
      getSignedThumbUrl: jest.fn(),
      deleteObject: jest.fn(),
    } as unknown as StorageService;
    const gemini = { generateText: jest.fn() } as unknown as GeminiService;
    service = new BoardService(
      prisma,
      storage,
      gemini,
      noTrips,
      noActivity,
      noAnalytics,
      noMissions,
    );
  });

  it('throws NotFound when the board does not exist', async () => {
    board.findUnique.mockResolvedValue(null);
    await expect(
      service.updateBoard(USER_ID, BOARD_ID, { title: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(board.update).not.toHaveBeenCalled();
  });

  it('throws Forbidden when the caller does not own the board', async () => {
    board.findUnique.mockResolvedValue({ id: BOARD_ID, userId: 999 });
    await expect(
      service.updateBoard(USER_ID, BOARD_ID, { title: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(board.update).not.toHaveBeenCalled();
  });

  it('updates fields and returns the new summary with real pin count', async () => {
    const result = await service.updateBoard(USER_ID, BOARD_ID, {
      title: 'New Title',
      description: 'New desc',
      cityId: 5,
      stateId: 6,
      countryId: 7,
    });

    expect(board.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BOARD_ID },
        data: {
          title: 'New Title',
          description: 'New desc',
          cityId: 5,
          stateId: 6,
          countryId: 7,
        },
      }),
    );
    expect(result.title).toBe('New Title');
    expect(result.pinCount).toBe(3);
    expect(result.locationLabel).toBe('Da Lat, Lam Dong, Vietnam');
  });
});

describe('BoardService.generateTrip', () => {
  const USER_ID = 42;
  const BOARD_ID = 7;
  const TRIP_ID = 100;

  type PlanItemData = {
    title: string;
    dayNumber: number;
    startTime: string;
    category: ExpenseCategory | null;
    sortOrder: number;
  };

  const makePin = (over: Partial<Record<string, unknown>>) => ({
    id: 0,
    boardId: BOARD_ID,
    name: 'Pin',
    address: null,
    latitude: null,
    longitude: null,
    notes: null,
    sourceUrl: null,
    sourceTimestampSec: null,
    category: null,
    dayNumber: null,
    timeOfDayText: null,
    sortOrder: 0,
    createdAt: new Date(),
    ...over,
  });

  function build(opts: {
    pins: ReturnType<typeof makePin>[];
    geminiResult?: unknown;
    geminiThrows?: boolean;
    foundPins?: ReturnType<typeof makePin>[]; // override findMany result
    ownerId?: number;
    boardMissing?: boolean;
    preferredCurrency?: Currency | null;
  }) {
    const planItemCreate = jest
      .fn()
      .mockImplementation(({ data }: { data: PlanItemData }) =>
        Promise.resolve({ id: 1000 + data.sortOrder + data.dayNumber * 10 }),
      );
    const tripCreate = jest.fn().mockResolvedValue({ id: TRIP_ID });
    const tx = {
      trip: { create: tripCreate },
      tripMember: { create: jest.fn().mockResolvedValue({}) },
      tripPlanItem: { create: planItemCreate },
      tripPlanItemMember: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      board: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            opts.boardMissing
              ? null
              : { id: BOARD_ID, userId: opts.ownerId ?? USER_ID },
          ),
      },
      boardPin: {
        findMany: jest.fn().mockResolvedValue(opts.foundPins ?? opts.pins),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          preferredCurrency:
            opts.preferredCurrency === undefined
              ? Currency.THB
              : opts.preferredCurrency,
        }),
      },
      $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
        cb(tx),
      ),
    } as unknown as PrismaService;

    const storage = {} as unknown as StorageService;
    const generateJsonFromText = opts.geminiThrows
      ? jest.fn().mockRejectedValue(new Error('vertex down'))
      : jest.fn().mockResolvedValue(opts.geminiResult ?? { assignments: [] });
    const gemini = { generateJsonFromText } as unknown as GeminiService;

    const getTrip = jest.fn().mockResolvedValue({ id: TRIP_ID, name: 'T' });
    const trips = { getTrip } as unknown as TripsService;
    const activity = { log: jest.fn() } as unknown as TripActivityService;

    const service = new BoardService(
      prisma,
      storage,
      gemini,
      trips,
      activity,
      noAnalytics,
      noMissions,
    );
    return {
      service,
      prisma,
      planItemCreate,
      tripCreate,
      getTrip,
      trips,
      generateJsonFromText,
    };
  }

  const dto = (over: Partial<Record<string, unknown>> = {}) =>
    ({ pinIds: [1, 2, 3], dayCount: 2, tripName: 'My Trip', ...over }) as never;

  const createdItems = (m: jest.Mock): PlanItemData[] =>
    (m.mock.calls as Array<[{ data: PlanItemData }]>).map((c) => c[0].data);

  it('arranges pins via Gemini into the assigned days + start times', async () => {
    const pins = [
      makePin({ id: 1, name: 'A' }),
      makePin({ id: 2, name: 'B' }),
      makePin({ id: 3, name: 'C' }),
    ];
    const { service, planItemCreate, tripCreate, getTrip } = build({
      pins,
      geminiResult: {
        assignments: [
          { id: 1, day: 1, startTime: '09:00' },
          { id: 2, day: 1, startTime: '13:00' },
          { id: 3, day: 2, startTime: '10:00' },
        ],
      },
    });

    const result = await service.generateTrip(USER_ID, BOARD_ID, dto());

    expect(tripCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          name: 'My Trip',
          currency: Currency.THB, // user's preferred, NOT the VND schema default
          createdById: USER_ID,
        }),
      }),
    );
    const items = createdItems(planItemCreate);
    expect(items).toHaveLength(3);
    const byTitle = Object.fromEntries(items.map((i) => [i.title, i]));
    expect(byTitle.A.dayNumber).toBe(1);
    expect(byTitle.A.startTime).toBe('09:00');
    expect(byTitle.C.dayNumber).toBe(2);
    expect(byTitle.C.startTime).toBe('10:00');
    expect(getTrip).toHaveBeenCalledWith(TRIP_ID, USER_ID);
    expect(result).toEqual({ id: TRIP_ID, name: 'T' });
  });

  it('falls back to a round-robin split when Gemini fails', async () => {
    const pins = [
      makePin({ id: 1, name: 'A' }),
      makePin({ id: 2, name: 'B' }),
      makePin({ id: 3, name: 'C' }),
    ];
    const { service, planItemCreate } = build({ pins, geminiThrows: true });

    await service.generateTrip(USER_ID, BOARD_ID, dto({ dayCount: 2 }));

    const days = createdItems(planItemCreate)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((i) => i.dayNumber);
    expect(days).toEqual([1, 2, 1]); // A,B,C round-robin across 2 days
    expect(createdItems(planItemCreate)).toHaveLength(3);
  });

  it('drops invented ids and fills pins the model skipped', async () => {
    const pins = [
      makePin({ id: 1, name: 'A' }),
      makePin({ id: 2, name: 'B' }),
      makePin({ id: 3, name: 'C' }),
    ];
    const { service, planItemCreate } = build({
      pins,
      geminiResult: {
        assignments: [
          { id: 1, day: 1, startTime: '09:00' },
          { id: 999, day: 2, startTime: '11:00' }, // invented — must be ignored
          // ids 2 and 3 skipped — must be filled
        ],
      },
    });

    await service.generateTrip(USER_ID, BOARD_ID, dto({ dayCount: 2 }));

    const titles = createdItems(planItemCreate)
      .map((i) => i.title)
      .sort();
    expect(titles).toEqual(['A', 'B', 'C']); // every real pin placed, no ghost
  });

  it('maps pin categories onto the ExpenseCategory enum', async () => {
    const pins = [
      makePin({ id: 1, name: 'Eatery', category: 'restaurant' }),
      makePin({ id: 2, name: 'Inn', category: 'hotel' }),
      makePin({ id: 3, name: 'Gallery', category: 'museum' }),
      makePin({ id: 4, name: 'Mystery', category: 'speakeasy' }),
    ];
    const { service, planItemCreate } = build({
      pins,
      geminiResult: { assignments: [] }, // force fallback placement, categories still mapped
    });

    await service.generateTrip(
      USER_ID,
      BOARD_ID,
      dto({ pinIds: [1, 2, 3, 4], dayCount: 1 }),
    );

    const byTitle = Object.fromEntries(
      createdItems(planItemCreate).map((i) => [i.title, i.category]),
    );
    expect(byTitle.Eatery).toBe(ExpenseCategory.FOOD);
    expect(byTitle.Inn).toBe(ExpenseCategory.STAY);
    expect(byTitle.Gallery).toBe(ExpenseCategory.TICKET);
    expect(byTitle.Mystery).toBeNull(); // unknown vocabulary → null
  });

  it('throws Forbidden when the caller does not own the board', async () => {
    const { service } = build({
      pins: [makePin({ id: 1 })],
      ownerId: 999,
    });
    await expect(
      service.generateTrip(USER_ID, BOARD_ID, dto({ pinIds: [1] })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFound when a requested pin is not on the board', async () => {
    const { service } = build({
      pins: [makePin({ id: 1 }), makePin({ id: 2 }), makePin({ id: 3 })],
      foundPins: [makePin({ id: 1 }), makePin({ id: 2 })], // pin 3 missing
    });
    await expect(
      service.generateTrip(USER_ID, BOARD_ID, dto({ pinIds: [1, 2, 3] })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sends the daily-template prompt without a suggestions rule by default', async () => {
    const pins = [makePin({ id: 1, name: 'A' })];
    const { service, generateJsonFromText } = build({ pins });

    await service.generateTrip(
      USER_ID,
      BOARD_ID,
      dto({ pinIds: [1], dayCount: 1 }),
    );

    const prompt =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (generateJsonFromText.mock.calls[0]?.[0] as Record<string, unknown>)
        .prompt as string;
    expect(prompt).toContain('home base');
    expect(prompt).toContain('breakfast');
    expect(prompt).not.toContain('suggestion');
  });

  it('includes the suggestions rule in the prompt when fillGaps is true', async () => {
    const pins = [makePin({ id: 1, name: 'A' })];
    const { service, generateJsonFromText } = build({ pins });

    await service.generateTrip(
      USER_ID,
      BOARD_ID,
      dto({ pinIds: [1], dayCount: 1, fillGaps: true }),
    );

    const prompt =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (generateJsonFromText.mock.calls[0]?.[0] as Record<string, unknown>)
        .prompt as string;
    expect(prompt).toContain('suggestion');
    // Must be imperative: a permissive "MAY add" makes the model return an
    // empty suggestions array at temperature 0 (regression: 9-pin board,
    // fillGaps on, zero suggestions persisted).
    expect(prompt).toContain('MUST add');
  });

  it('ignores a mealSlot field on assignments without breaking placement', async () => {
    const pins = [makePin({ id: 1, name: 'A' }), makePin({ id: 2, name: 'B' })];
    const { service, planItemCreate } = build({
      pins,
      geminiResult: {
        assignments: [
          { id: 1, day: 1, startTime: '08:00', mealSlot: 'breakfast' },
          { id: 2, day: 1, startTime: '12:00', mealSlot: 'lunch' },
        ],
      },
    });

    await service.generateTrip(
      USER_ID,
      BOARD_ID,
      dto({ pinIds: [1, 2], dayCount: 1 }),
    );

    const items = createdItems(planItemCreate);
    expect(items.map((i) => i.startTime).sort()).toEqual(['08:00', '12:00']);
  });

  type RawSuggestionLike = {
    name: string;
    day: number;
    startTime: string;
    latitude: number;
    longitude: number;
    category?: string;
  };

  it('persists valid AI suggestions as marked plan items when fillGaps is true', async () => {
    const pins = [makePin({ id: 1, name: 'A', latitude: 10, longitude: 106 })];
    const { service, planItemCreate } = build({
      pins,
      geminiResult: {
        assignments: [{ id: 1, day: 1, startTime: '09:00' }],
        suggestions: [
          {
            name: 'Pho Corner',
            day: 1,
            startTime: '08:00',
            latitude: 10.01,
            longitude: 106.01,
            address: '12 Duong Le Loi, Da Lat',
            category: 'restaurant',
          },
        ],
      },
    });

    await service.generateTrip(
      USER_ID,
      BOARD_ID,
      dto({ pinIds: [1], dayCount: 1, fillGaps: true }),
    );

    const calls = planItemCreate.mock.calls as Array<
      [
        {
          data: PlanItemData & {
            description: string | null;
            location: string | null;
            address: string | null;
          };
        },
      ]
    >;
    const suggested = calls
      .map((c) => c[0].data)
      .find((d) => d.title === 'Pho Corner');
    expect(suggested).toBeDefined();
    expect(suggested!.description).toBe('✨ Suggested by AI');
    expect(suggested!.category).toBe(ExpenseCategory.FOOD);
    expect(suggested!.dayNumber).toBe(1);
    // The model's street address lands on both display fields, like pins.
    expect(suggested!.location).toBe('12 Duong Le Loi, Da Lat');
    expect(suggested!.address).toBe('12 Duong Le Loi, Da Lat');
    // Suggested 08:00 breakfast sorts before the 09:00 pin.
    expect(suggested!.sortOrder).toBe(0);
  });

  it('discards suggestions entirely when fillGaps is false', async () => {
    const pins = [makePin({ id: 1, name: 'A' })];
    const { service, planItemCreate } = build({
      pins,
      geminiResult: {
        assignments: [{ id: 1, day: 1, startTime: '09:00' }],
        suggestions: [
          {
            name: 'Sneaky Cafe',
            day: 1,
            startTime: '08:00',
            latitude: 10,
            longitude: 106,
            category: 'cafe',
          },
        ],
      },
    });

    await service.generateTrip(
      USER_ID,
      BOARD_ID,
      dto({ pinIds: [1], dayCount: 1 }),
    );

    const titles = createdItems(planItemCreate).map((i) => i.title);
    expect(titles).toEqual(['A']);
  });

  it('drops invalid suggestions and caps them at 3 per day', async () => {
    const pins = [makePin({ id: 1, name: 'A' })];
    const mkSug = (name: string, over: Partial<RawSuggestionLike> = {}) => ({
      name,
      day: 1,
      startTime: '10:00',
      latitude: 10,
      longitude: 106,
      category: 'restaurant',
      ...over,
    });
    const { service, planItemCreate } = build({
      pins,
      geminiResult: {
        assignments: [{ id: 1, day: 1, startTime: '09:00' }],
        suggestions: [
          mkSug('Bad Lat', { latitude: 999 }),
          mkSug('Bad Day', { day: 5 }), // trip is 1 day
          mkSug('Bad Time', { startTime: 'noonish' }),
          mkSug('', {}), // empty name
          mkSug('a', { name: 'A' }), // duplicates pin name
          mkSug('Keep 1', { startTime: '08:00' }),
          mkSug('Keep 2', { startTime: '12:00' }),
          mkSug('Keep 3', { startTime: '15:00' }),
          mkSug('Over Cap', { startTime: '18:00' }), // 4th valid on day 1
        ],
      },
    });

    await service.generateTrip(
      USER_ID,
      BOARD_ID,
      dto({ pinIds: [1], dayCount: 1, fillGaps: true }),
    );

    const titles = createdItems(planItemCreate)
      .map((i) => i.title)
      .sort();
    expect(titles).toEqual(['A', 'Keep 1', 'Keep 2', 'Keep 3']);
  });

  describe('vibes', () => {
    const promptOf = (m: jest.Mock): string =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (m.mock.calls[0]?.[0] as Record<string, unknown>).prompt as string;

    it('keeps the "never drop" rule when no vibes are sent', async () => {
      const pins = [makePin({ id: 1, name: 'A' })];
      const { service, generateJsonFromText } = build({ pins });

      await service.generateTrip(
        USER_ID,
        BOARD_ID,
        dto({ pinIds: [1], dayCount: 1 }),
      );

      const prompt = promptOf(generateJsonFromText);
      expect(prompt).toContain('never invent, drop, merge, or rename');
      expect(prompt).toContain('Assign every place to exactly one day');
      expect(prompt).not.toContain('vibes');
    });

    it('describes the chosen vibes and allows dropping when vibes are sent', async () => {
      const pins = [makePin({ id: 1, name: 'A' })];
      const { service, generateJsonFromText } = build({ pins });

      await service.generateTrip(
        USER_ID,
        BOARD_ID,
        dto({
          pinIds: [1],
          dayCount: 1,
          vibes: [TripVibe.FOOD_TOUR, TripVibe.NIGHTLIFE],
        }),
      );

      const prompt = promptOf(generateJsonFromText);
      expect(prompt).toContain('Food tour');
      expect(prompt).toContain('Nightlife');
      expect(prompt).toContain('omitting it from "assignments"');
      expect(prompt).toContain('restaurant, cafe, bar');
      expect(prompt).not.toContain('never invent, drop, merge');
      expect(prompt).not.toContain('Assign every place');
    });

    it('drops pins the model omitted when vibes are sent', async () => {
      const pins = [
        makePin({ id: 1, name: 'A' }),
        makePin({ id: 2, name: 'B' }),
        makePin({ id: 3, name: 'C' }),
      ];
      const { service, planItemCreate } = build({
        pins,
        geminiResult: {
          assignments: [
            { id: 1, day: 1, startTime: '09:00' },
            { id: 2, day: 2, startTime: '12:00' },
          ],
        },
      });

      await service.generateTrip(
        USER_ID,
        BOARD_ID,
        dto({ vibes: [TripVibe.FOOD_TOUR] }),
      );

      const titles = createdItems(planItemCreate).map((i) => i.title);
      expect(titles.sort()).toEqual(['A', 'B']);
    });

    it('still round-robin fills omitted pins when no vibes are sent', async () => {
      const pins = [
        makePin({ id: 1, name: 'A' }),
        makePin({ id: 2, name: 'B' }),
        makePin({ id: 3, name: 'C' }),
      ];
      const { service, planItemCreate } = build({
        pins,
        geminiResult: {
          assignments: [
            { id: 1, day: 1, startTime: '09:00' },
            { id: 2, day: 2, startTime: '12:00' },
          ],
        },
      });

      await service.generateTrip(USER_ID, BOARD_ID, dto());

      const titles = createdItems(planItemCreate).map((i) => i.title);
      expect(titles.sort()).toEqual(['A', 'B', 'C']);
    });

    it('always keeps a hotel even if the model omitted it', async () => {
      const pins = [
        makePin({ id: 1, name: 'Ramen', category: 'restaurant' }),
        makePin({ id: 2, name: 'Museum', category: 'museum' }),
        makePin({ id: 3, name: 'Hotel', category: 'hotel' }),
      ];
      const { service, planItemCreate } = build({
        pins,
        geminiResult: {
          assignments: [{ id: 1, day: 1, startTime: '12:00' }],
        },
      });

      await service.generateTrip(
        USER_ID,
        BOARD_ID,
        dto({ vibes: [TripVibe.FOOD_TOUR] }),
      );

      const items = createdItems(planItemCreate);
      expect(items.map((i) => i.title).sort()).toEqual(['Hotel', 'Ramen']);
      expect(items.find((i) => i.title === 'Hotel')?.category).toBe(
        ExpenseCategory.STAY,
      );
    });

    it('falls back to the category filter when the model keeps no pins', async () => {
      const pins = [
        makePin({ id: 1, name: 'Ramen', category: 'restaurant' }),
        makePin({ id: 2, name: 'Museum', category: 'museum' }),
        makePin({ id: 3, name: 'Cafe', category: 'cafe' }),
      ];
      const { service, planItemCreate } = build({
        pins,
        geminiResult: {
          assignments: [{ id: 999, day: 1, startTime: '09:00' }],
        },
      });

      await service.generateTrip(
        USER_ID,
        BOARD_ID,
        dto({ vibes: [TripVibe.FOOD_TOUR] }),
      );

      const titles = createdItems(planItemCreate).map((i) => i.title);
      expect(titles.sort()).toEqual(['Cafe', 'Ramen']);
    });

    it('filters by category (plus hotel) when Gemini throws', async () => {
      const pins = [
        makePin({ id: 1, name: 'Ramen', category: 'restaurant' }),
        makePin({ id: 2, name: 'Museum', category: 'museum' }),
        makePin({ id: 3, name: 'Bar', category: 'bar' }),
        makePin({ id: 4, name: 'Hotel', category: 'hotel' }),
      ];
      const { service, planItemCreate } = build({ pins, geminiThrows: true });

      await service.generateTrip(
        USER_ID,
        BOARD_ID,
        dto({ pinIds: [1, 2, 3, 4], dayCount: 2, vibes: [TripVibe.FOOD_TOUR] }),
      );

      const items = createdItems(planItemCreate);
      expect(items.map((i) => i.title).sort()).toEqual([
        'Bar',
        'Hotel',
        'Ramen',
      ]);
      // Round-robin across the 2 requested days.
      expect(new Set(items.map((i) => i.dayNumber))).toEqual(new Set([1, 2]));
    });

    it('uses every pin when the fallback filter matches nothing', async () => {
      const pins = [
        makePin({ id: 1, name: 'Museum', category: 'museum' }),
        makePin({ id: 2, name: 'Park', category: 'park' }),
        makePin({ id: 3, name: 'Unknown' }),
      ];
      const { service, planItemCreate } = build({ pins, geminiThrows: true });

      await service.generateTrip(
        USER_ID,
        BOARD_ID,
        dto({ vibes: [TripVibe.SHOPPING] }),
      );

      const titles = createdItems(planItemCreate).map((i) => i.title);
      expect(titles.sort()).toEqual(['Museum', 'Park', 'Unknown']);
    });
  });

  describe('narrated schedule (dayNumber / timeOfDayText)', () => {
    it('forces the narrated day and time over the model output', async () => {
      const pins = [
        makePin({ id: 1, name: 'A', dayNumber: 2, timeOfDayText: 'chiều' }),
        makePin({ id: 2, name: 'B' }),
      ];
      const { service, planItemCreate } = build({
        pins,
        geminiResult: {
          assignments: [
            { id: 1, day: 1, startTime: '10:00' },
            { id: 2, day: 1, startTime: '12:00' },
          ],
        },
      });

      await service.generateTrip(USER_ID, BOARD_ID, dto({ pinIds: [1, 2] }));

      const byTitle = Object.fromEntries(
        createdItems(planItemCreate).map((i) => [i.title, i]),
      );
      expect(byTitle.A.dayNumber).toBe(2);
      expect(byTitle.A.startTime).toBe('15:00');
      expect(byTitle.B.dayNumber).toBe(1);
      expect(byTitle.B.startTime).toBe('12:00');
    });

    it('keeps input order for same-day pins with the same narrated time', async () => {
      const pins = [
        makePin({ id: 1, name: 'First', dayNumber: 1, timeOfDayText: 'trưa' }),
        makePin({ id: 2, name: 'Second', dayNumber: 1, timeOfDayText: 'trưa' }),
        makePin({
          id: 3,
          name: 'Morning',
          dayNumber: 1,
          timeOfDayText: 'sáng',
        }),
      ];
      const { service, planItemCreate } = build({ pins, geminiThrows: true });

      await service.generateTrip(USER_ID, BOARD_ID, dto({ dayCount: 1 }));

      const items = createdItems(planItemCreate).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      expect(items.map((i) => i.title)).toEqual(['Morning', 'First', 'Second']);
      expect(items.map((i) => i.startTime)).toEqual([
        '08:00',
        '12:00',
        '12:00',
      ]);
    });

    it('grows dayCount to the max narrated day', async () => {
      const pins = [
        makePin({ id: 1, name: 'A', dayNumber: 1 }),
        makePin({ id: 2, name: 'B', dayNumber: 3 }),
        makePin({ id: 3, name: 'C' }),
      ];
      const { service, planItemCreate } = build({ pins, geminiThrows: true });

      await service.generateTrip(USER_ID, BOARD_ID, dto({ dayCount: 1 }));

      const byTitle = Object.fromEntries(
        createdItems(planItemCreate).map((i) => [i.title, i]),
      );
      expect(byTitle.B.dayNumber).toBe(3);
      expect(byTitle.A.dayNumber).toBe(1);
    });

    it('does not grow dayCount to the narrated day in vibe mode', async () => {
      const pins = [
        makePin({ id: 1, name: 'A', dayNumber: 1, category: 'restaurant' }),
        makePin({ id: 2, name: 'B', dayNumber: 3, category: 'cafe' }),
        makePin({ id: 3, name: 'C', category: 'museum' }),
      ];
      const { service, planItemCreate, generateJsonFromText } = build({
        pins,
        geminiResult: {
          assignments: [
            { id: 1, day: 1, startTime: '09:00' },
            { id: 2, day: 1, startTime: '15:00' },
          ],
        },
      });

      await service.generateTrip(
        USER_ID,
        BOARD_ID,
        dto({ dayCount: 1, vibes: [TripVibe.FOOD_TOUR] }),
      );

      const prompt =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (generateJsonFromText.mock.calls[0]?.[0] as Record<string, unknown>)
          .prompt as string;
      expect(prompt).toContain('planning a 1-day trip');
      const items = createdItems(planItemCreate);
      expect(items.map((i) => i.title).sort()).toEqual(['A', 'B']);
      expect(items.every((i) => i.dayNumber === 1)).toBe(true);
    });
  });

  describe('generateTripFromPins', () => {
    const pinsDto = (over: Partial<Record<string, unknown>> = {}) =>
      ({
        pins: [
          { name: 'Buôn Kơ Lang', dayNumber: 1, timeOfDayText: 'trưa' },
          { name: 'Air dream 2', dayNumber: 1, timeOfDayText: 'chiều' },
          { name: 'Bánh Mì Xíu Mại', dayNumber: 2, timeOfDayText: 'sáng' },
        ],
        dayCount: 1,
        tripName: 'Đà Lạt',
        stateId: 5,
        countryId: 6,
        ...over,
      }) as never;

    it('creates the trip with the inline destination and no board queries', async () => {
      const { service, prisma, tripCreate, planItemCreate } = build({
        pins: [],
        geminiResult: {
          assignments: [
            { id: 1, day: 1, startTime: '09:00' },
            { id: 2, day: 1, startTime: '10:00' },
            { id: 3, day: 1, startTime: '11:00' },
          ],
        },
      });

      await service.generateTripFromPins(USER_ID, pinsDto({ cityId: 4 }));

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.board.findUnique).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.boardPin.findMany).not.toHaveBeenCalled();
      expect(tripCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            name: 'Đà Lạt',
            cityId: 4,
            stateId: 5,
            countryId: 6,
          }),
        }),
      );
      const items = createdItems(planItemCreate).sort(
        (a, b) => a.dayNumber - b.dayNumber || a.sortOrder - b.sortOrder,
      );
      expect(items.map((i) => [i.title, i.dayNumber, i.startTime])).toEqual([
        ['Buôn Kơ Lang', 1, '12:00'],
        ['Air dream 2', 1, '15:00'],
        ['Bánh Mì Xíu Mại', 2, '08:00'],
      ]);
    });

    it('dedupes duplicate inline pins', async () => {
      const { service, planItemCreate } = build({
        pins: [],
        geminiThrows: true,
      });

      await service.generateTripFromPins(
        USER_ID,
        pinsDto({
          pins: [
            { name: 'Waken Beans', latitude: 11.94, longitude: 108.44 },
            { name: 'waken beans', latitude: 11.94, longitude: 108.44 },
            { name: 'Other' },
          ],
        }),
      );

      const titles = createdItems(planItemCreate).map((i) => i.title);
      expect(titles.sort()).toEqual(['Other', 'Waken Beans']);
    });
  });
});
