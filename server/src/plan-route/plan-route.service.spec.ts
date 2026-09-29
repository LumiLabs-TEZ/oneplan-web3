import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InviteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanRouteService } from './plan-route.service';
import { encodePolyline } from './polyline';

const DATE = '2026-07-20';
const API_KEY = 'test-mapbox-token';

interface FakePlanItem {
  id: number;
  title: string;
  latitude: number | null;
  longitude: number | null;
  location: string | null;
  startTime: string | null;
  sortOrder: number;
}

describe('PlanRouteService', () => {
  let service: PlanRouteService;
  let prisma: any;
  let config: Pick<ConfigService, 'get'>;
  let fetchSpy: jest.SpyInstance;

  const buildService = (apiKey: string = API_KEY) => {
    prisma = {
      tripMember: { findUnique: jest.fn() },
      tripPlanItem: { findMany: jest.fn() },
      planRouteCache: { findUnique: jest.fn(), create: jest.fn() },
    };
    config = {
      get: jest.fn((key: string) =>
        key === 'MAPBOX_ACCESS_TOKEN' ? apiKey : undefined,
      ) as any,
    };
    service = new PlanRouteService(
      prisma as PrismaService,
      config as ConfigService,
    );
  };

  const asAcceptedMember = () => {
    prisma.tripMember.findUnique.mockResolvedValue({
      inviteStatus: InviteStatus.ACCEPTED,
    });
  };

  const mockItems = (items: FakePlanItem[]) => {
    prisma.tripPlanItem.findMany.mockResolvedValue(items);
  };

  /** Coordinates in the Mapbox request path, as `[lng, lat]` pairs. */
  const requestCoordinates = (url: string): [number, number][] =>
    new URL(url).pathname
      .split('/')
      .pop()!
      .split(';')
      .map((pair) => pair.split(',').map(Number) as [number, number]);

  /** Mapbox-shaped success: one leg per consecutive pair, two steps per leg. */
  const mockDirectionsSuccess = () => {
    fetchSpy.mockImplementation(async (url: string) => {
      const coords = requestCoordinates(url);
      const legs = coords.slice(0, -1).map((from, i) => {
        const to = coords[i + 1];
        const mid: [number, number] = [
          (from[0] + to[0]) / 2,
          (from[1] + to[1]) / 2,
        ];
        return {
          duration: 600.4,
          distance: 5000.6,
          steps: [
            { geometry: { coordinates: [from, mid] } },
            { geometry: { coordinates: [mid, to] } },
            { geometry: { coordinates: [to, to] } }, // arrive step
          ],
        };
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 'Ok', routes: [{ legs }] }),
      } as unknown as Response;
    });
  };

  const respondWith = (status: number, body: unknown) => {
    fetchSpy.mockImplementation(
      async () =>
        ({
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
        }) as unknown as Response,
    );
  };

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error(
        'unexpected fetch call — test should have mocked this explicitly',
      );
    });
    buildService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws 403 for a non-member', async () => {
    prisma = {
      tripMember: { findUnique: jest.fn().mockResolvedValue(null) },
      tripPlanItem: { findMany: jest.fn() },
      planRouteCache: { findUnique: jest.fn(), create: jest.fn() },
    };
    service = new PlanRouteService(
      prisma as PrismaService,
      config as ConfigService,
    );

    await expect(
      service.getPlanRoute(1, 1, { date: DATE }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tripPlanItem.findMany).not.toHaveBeenCalled();
  });

  describe('day selector', () => {
    it('filters by planDate when date is given', async () => {
      asAcceptedMember();
      mockItems([]);
      await service.getPlanRoute(1, 1, { date: DATE });
      expect(prisma.tripPlanItem.findMany.mock.calls[0][0].where).toEqual({
        tripId: 1,
        planDate: new Date(DATE),
      });
    });

    it('filters by dayNumber when day is given (planning trips)', async () => {
      asAcceptedMember();
      mockItems([]);
      await service.getPlanRoute(1, 1, { day: 2 });
      expect(prisma.tripPlanItem.findMany.mock.calls[0][0].where).toEqual({
        tripId: 1,
        dayNumber: 2,
      });
    });

    it.each([[{}], [{ date: DATE, day: 1 }]])(
      'rejects %j with 400 before touching the DB',
      async (query) => {
        await expect(service.getPlanRoute(1, 1, query)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.tripMember.findUnique).not.toHaveBeenCalled();
      },
    );
  });

  describe('pin ordering', () => {
    it('orders timed items before untimed, by startTime, then sortOrder, then id', async () => {
      asAcceptedMember();
      mockItems([
        {
          id: 3,
          title: 'Untimed B',
          latitude: 10,
          longitude: 20,
          location: null,
          startTime: null,
          sortOrder: 1,
        },
        {
          id: 2,
          title: 'Untimed A',
          latitude: 10,
          longitude: 20,
          location: null,
          startTime: null,
          sortOrder: 0,
        },
        {
          id: 1,
          title: 'Afternoon',
          latitude: 10,
          longitude: 20,
          location: 'Cafe',
          startTime: '14:00',
          sortOrder: 0,
        },
        {
          id: 5,
          title: 'Morning tie B',
          latitude: 10,
          longitude: 20,
          location: null,
          startTime: '09:00',
          sortOrder: 0,
        },
        {
          id: 4,
          title: 'Morning tie A',
          latitude: 10,
          longitude: 20,
          location: null,
          startTime: '09:00',
          sortOrder: 0,
        },
      ]);

      const result = await service.getPlanRoute(1, 1, { date: DATE });

      expect(result.pins.map((p) => p.id)).toEqual([4, 5, 1, 2, 3]);
      expect(result.pins.map((p) => p.index)).toEqual([1, 2, 3, 4, 5]);
    });

    it('filters out items without coordinates without consuming an index', async () => {
      asAcceptedMember();
      mockItems([
        {
          id: 1,
          title: 'Located',
          latitude: 10,
          longitude: 20,
          location: null,
          startTime: '09:00',
          sortOrder: 0,
        },
        {
          id: 2,
          title: 'No coords',
          latitude: null,
          longitude: null,
          location: null,
          startTime: '08:00',
          sortOrder: 0,
        },
        {
          id: 3,
          title: 'Also located',
          latitude: 11,
          longitude: 21,
          location: null,
          startTime: '10:00',
          sortOrder: 0,
        },
      ]);

      const result = await service.getPlanRoute(1, 1, { date: DATE });

      expect(result.pins.map((p) => p.id)).toEqual([1, 3]);
      expect(result.pins.map((p) => p.index)).toEqual([1, 2]);
    });
  });

  it('returns legs: [] and makes zero upstream calls for < 2 pins', async () => {
    asAcceptedMember();
    mockItems([
      {
        id: 1,
        title: 'Only stop',
        latitude: 10,
        longitude: 20,
        location: null,
        startTime: null,
        sortOrder: 0,
      },
    ]);

    const result = await service.getPlanRoute(1, 1, { date: DATE });

    expect(result.legs).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  const twoPins: FakePlanItem[] = [
    {
      id: 1,
      title: 'A',
      latitude: 10,
      longitude: 20,
      location: null,
      startTime: null,
      sortOrder: 0,
    },
    {
      id: 2,
      title: 'B',
      latitude: 11,
      longitude: 21,
      location: null,
      startTime: null,
      sortOrder: 1,
    },
  ];
  const NULL_LEG = {
    polyline: null,
    durationSec: null,
    distanceM: null,
    mode: 'drive',
  };

  it('falls back to null legs with no 500 when MAPBOX_ACCESS_TOKEN is unset', async () => {
    buildService('');
    asAcceptedMember();
    mockItems(twoPins);

    const result = await service.getPlanRoute(1, 1, { date: DATE });

    expect(result.legs).toEqual([NULL_LEG]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls Mapbox driving directions with lng,lat pairs, steps and GeoJSON geometry', async () => {
    asAcceptedMember();
    mockItems(twoPins);
    mockDirectionsSuccess();

    await service.getPlanRoute(1, 1, { date: DATE });

    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(
      'https://api.mapbox.com/directions/v5/mapbox/driving/20,10;21,11',
    );
    expect(url.searchParams.get('steps')).toBe('true');
    expect(url.searchParams.get('geometries')).toBe('geojson');
    expect(url.searchParams.get('overview')).toBe('false');
    expect(url.searchParams.get('access_token')).toBe(API_KEY);
  });

  it('stitches each leg from its steps (junction points once) and rounds duration/distance', async () => {
    asAcceptedMember();
    mockItems(twoPins);
    mockDirectionsSuccess();

    const result = await service.getPlanRoute(1, 1, { date: DATE });

    // from (10,20) → mid (10.5,20.5) → to (11,21): three distinct points.
    expect(result.legs).toEqual([
      {
        polyline: encodePolyline([
          { latitude: 10, longitude: 20 },
          { latitude: 10.5, longitude: 20.5 },
          { latitude: 11, longitude: 21 },
        ]),
        durationSec: 600,
        distanceM: 5001,
        mode: 'drive',
      },
    ]);
  });

  describe('walk vs drive', () => {
    const at = (
      id: number,
      latitude: number,
      longitude: number,
    ): FakePlanItem => ({
      id,
      title: `Stop ${id}`,
      latitude,
      longitude,
      location: null,
      startTime: null,
      sortOrder: id,
    });
    // A→B ≈ 0.85 km (walk), B→C ≈ 11 km (drive), C→D ≈ 0.5 km (walk).
    const mixed = [
      at(1, 11.9416, 108.4346),
      at(2, 11.9413, 108.4424),
      at(3, 11.8951, 108.5312),
      at(4, 11.8995, 108.5312),
    ];
    const profileOf = (call: unknown[]) =>
      new URL(call[0] as string).pathname.split('/')[4];

    it('walks legs under 1 km and drives the rest, one request per run', async () => {
      asAcceptedMember();
      mockItems(mixed);
      mockDirectionsSuccess();

      const result = await service.getPlanRoute(1, 1, { day: 1 });

      expect(fetchSpy.mock.calls.map(profileOf)).toEqual([
        'walking',
        'driving',
        'walking',
      ]);
      expect(result.legs.map((leg) => leg.mode)).toEqual([
        'walk',
        'drive',
        'walk',
      ]);
      expect(result.legs.every((leg) => leg.polyline !== null)).toBe(true);
    });

    it('batches consecutive walking legs into a single request', async () => {
      asAcceptedMember();
      mockItems([
        at(1, 11.94, 108.43),
        at(2, 11.945, 108.43),
        at(3, 11.95, 108.43),
      ]);
      mockDirectionsSuccess();

      await service.getPlanRoute(1, 1, { day: 1 });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(profileOf(fetchSpy.mock.calls[0])).toBe('walking');
    });

    it('keeps each leg mode on the straight-line fallback', async () => {
      buildService('');
      asAcceptedMember();
      mockItems(mixed);

      const result = await service.getPlanRoute(1, 1, { day: 1 });

      expect(result.legs.map((leg) => leg.mode)).toEqual([
        'walk',
        'drive',
        'walk',
      ]);
    });
  });

  it('never reads or writes the route cache (Mapbox terms forbid storing results)', async () => {
    asAcceptedMember();
    mockItems(twoPins);
    mockDirectionsSuccess();

    await service.getPlanRoute(1, 1, { date: DATE });
    await service.getPlanRoute(1, 1, { date: DATE });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(prisma.planRouteCache.findUnique).not.toHaveBeenCalled();
    expect(prisma.planRouteCache.create).not.toHaveBeenCalled();
  });

  it('chunks > 25 pins with a one-pin overlap and stitches legs.length == pins.length - 1', async () => {
    asAcceptedMember();
    const pins: FakePlanItem[] = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      title: `Stop ${i + 1}`,
      latitude: 10 + i / 50,
      longitude: 20 + i / 50,
      location: null,
      startTime: null,
      sortOrder: i,
    }));
    mockItems(pins);
    mockDirectionsSuccess();

    const result = await service.getPlanRoute(1, 1, { date: DATE });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const first = requestCoordinates(fetchSpy.mock.calls[0][0] as string);
    const second = requestCoordinates(fetchSpy.mock.calls[1][0] as string);
    expect(first).toHaveLength(25);
    expect(second).toHaveLength(6);
    expect(second[0]).toEqual(first[24]);
    expect(result.legs).toHaveLength(29);
    expect(result.legs.every((leg) => leg.polyline !== null)).toBe(true);
  });

  it.each([
    [
      'a non-Ok code (NoRoute)',
      () => respondWith(200, { code: 'NoRoute', routes: [] }),
    ],
    ['HTTP 401', () => respondWith(401, { message: 'Not Authorized' })],
    [
      'a leg-count mismatch',
      () => respondWith(200, { code: 'Ok', routes: [{ legs: [] }] }),
    ],
    [
      'a network error',
      () =>
        fetchSpy.mockImplementation(async () => {
          throw new Error('network down');
        }),
    ],
  ])(
    'falls back to null legs, pins still populated, on %s',
    async (_label, arrange) => {
      asAcceptedMember();
      mockItems(twoPins);
      arrange();

      const result = await service.getPlanRoute(1, 1, { date: DATE });

      expect(result.pins).toHaveLength(2);
      expect(result.legs).toEqual([NULL_LEG]);
    },
  );
});
