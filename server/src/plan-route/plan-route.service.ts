import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InviteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanRouteQueryDto } from './dto/plan-route-query.dto';
import { PlanRouteDto } from './dto/plan-route.dto';
import { haversineKm } from '../trip-generator/place-lookup';
import {
  PlanRouteLegDto,
  type PlanRouteLegMode,
} from './dto/plan-route-leg.dto';
import { PlanRoutePinDto } from './dto/plan-route-pin.dto';
import { encodePolyline, type LatLng } from './polyline';

const DIRECTIONS_API_URL = 'https://api.mapbox.com/directions/v5/mapbox';
const PROFILE: Record<PlanRouteLegMode, string> = {
  walk: 'walking',
  drive: 'driving',
};
// Stops closer than this (straight line) are walked: the driving profile obeys
// one-way streets, which turns short in-town hops into long car loops.
const WALK_MAX_STRAIGHT_KM = 1;
const FETCH_TIMEOUT_MS = 5_000;
// Mapbox Directions accepts at most 25 coordinates per request (billed as one
// request regardless of waypoint count).
const MAX_PINS_PER_CHUNK = 25;

interface MapboxStep {
  geometry?: { coordinates?: [number, number][] };
}

interface MapboxDirectionsResponse {
  code?: string;
  routes?: Array<{
    legs?: Array<{
      duration?: number;
      distance?: number;
      steps?: MapboxStep[];
    }>;
  }>;
}

interface LocatedPlanItem {
  id: number;
  title: string;
  latitude: number;
  longitude: number;
  location: string | null;
  startTime: string | null;
  sortOrder: number;
}

/**
 * Server-side day-route endpoint (Mapbox Directions API). Each leg is walked
 * when its stops are under `WALK_MAX_STRAIGHT_KM` apart, otherwise driven.
 *
 * Own external key (optional — falls back to straight-line legs, never throws).
 * Results are deliberately NOT cached: Mapbox Product Terms §2.10.1 forbid
 * caching or storing Navigation API results. (Google Maps Platform, the
 * previous provider, is unavailable to our Vietnam billing account — Vietnam
 * is a GMP Prohibited Territory.) The `PlanRouteCache` table is unused.
 */
@Injectable()
export class PlanRouteService {
  private readonly logger = new Logger(PlanRouteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getPlanRoute(
    tripId: number,
    userId: number,
    query: PlanRouteQueryDto,
  ): Promise<PlanRouteDto> {
    const { date, day } = query;
    if ((date == null) === (day == null)) {
      throw new BadRequestException('Exactly one of date or day is required');
    }

    await this.assertMember(tripId, userId);

    const pins = await this.derivePins(
      tripId,
      day != null ? { dayNumber: day } : { planDate: new Date(date!) },
    );

    if (pins.length < 2) {
      return { pins, legs: [] };
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { pins, legs: straightLineLegs(pins) };
    }

    const legs = await this.computeLegs(pins, apiKey);
    if (!legs) {
      // Upstream failure — pins still render, legs fall back to straight lines.
      return { pins, legs: straightLineLegs(pins) };
    }

    return { pins, legs };
  }

  // --- pin derivation ------------------------------------------------------

  private async derivePins(
    tripId: number,
    dayFilter: { planDate: Date } | { dayNumber: number },
  ): Promise<PlanRoutePinDto[]> {
    const items = await this.prisma.tripPlanItem.findMany({
      where: { tripId, ...dayFilter },
      select: {
        id: true,
        title: true,
        latitude: true,
        longitude: true,
        location: true,
        startTime: true,
        sortOrder: true,
      },
    });

    const located: LocatedPlanItem[] = items
      .filter((item) => item.latitude !== null && item.longitude !== null)
      .map((item) => ({
        id: item.id,
        title: item.title,
        latitude: item.latitude as number,
        longitude: item.longitude as number,
        location: item.location,
        startTime: item.startTime,
        sortOrder: item.sortOrder,
      }));

    const timed = located
      .filter((item) => item.startTime !== null)
      .sort((a, b) => {
        if (a.startTime !== b.startTime) {
          return a.startTime! < b.startTime! ? -1 : 1;
        }
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id - b.id;
      });

    const untimed = located
      .filter((item) => item.startTime === null)
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id - b.id;
      });

    return [...timed, ...untimed].map((item, offset) => ({
      id: item.id,
      index: offset + 1,
      title: item.title,
      latitude: item.latitude,
      longitude: item.longitude,
      subtitle: item.location,
      timeLabel: item.startTime,
    }));
  }

  // --- Mapbox Directions API ---------------------------------------------

  private async computeLegs(
    pins: PlanRoutePinDto[],
    apiKey: string,
  ): Promise<PlanRouteLegDto[] | null> {
    const legs: PlanRouteLegDto[] = [];

    // One request per run of consecutive same-mode legs (chunked to the
    // waypoint limit), so a walk → walk → drive day costs two requests.
    for (const run of modeRuns(legModes(pins))) {
      const runPins = pins.slice(run.from, run.to + 1);
      for (const chunk of chunkPins(runPins, MAX_PINS_PER_CHUNK)) {
        const chunkLegs = await this.callDirectionsApi(chunk, apiKey, run.mode);
        if (!chunkLegs) return null;
        legs.push(...chunkLegs);
      }
    }

    if (legs.length !== pins.length - 1) {
      this.logger.error(
        `Directions API stitching mismatch: expected ${pins.length - 1} legs, got ${legs.length}`,
      );
      return null;
    }

    return legs;
  }

  private async callDirectionsApi(
    chunk: PlanRoutePinDto[],
    apiKey: string,
    mode: PlanRouteLegMode,
  ): Promise<PlanRouteLegDto[] | null> {
    const coordinates = chunk
      .map((pin) => `${pin.longitude},${pin.latitude}`)
      .join(';');
    const params = new URLSearchParams({
      geometries: 'geojson',
      overview: 'false',
      steps: 'true',
      access_token: apiKey,
    });
    // Never log this URL — it carries the access token.
    const url = `${DIRECTIONS_API_URL}/${PROFILE[mode]}/${coordinates}?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (err) {
      this.logger.warn(
        `Directions API fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      this.logger.warn(`Directions API returned HTTP ${response.status}`);
      return null;
    }

    let payload: MapboxDirectionsResponse;
    try {
      payload = (await response.json()) as MapboxDirectionsResponse;
    } catch (err) {
      this.logger.warn(
        `Directions API returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }

    if (payload.code !== 'Ok') {
      this.logger.warn(`Directions API returned code ${payload.code ?? '?'}`);
      return null;
    }

    const routeLegs = payload.routes?.[0]?.legs;
    if (!routeLegs || routeLegs.length !== chunk.length - 1) {
      this.logger.warn(
        `Directions API returned ${routeLegs?.length ?? 0} legs for a ${chunk.length}-pin chunk`,
      );
      return null;
    }

    return routeLegs.map((leg) => {
      const points = legPoints(leg.steps ?? []);
      return {
        polyline: points.length >= 2 ? encodePolyline(points) : null,
        durationSec: leg.duration != null ? Math.round(leg.duration) : null,
        distanceM: leg.distance != null ? Math.round(leg.distance) : null,
        mode,
      };
    });
  }

  private getApiKey(): string {
    return this.config.get<string>('MAPBOX_ACCESS_TOKEN') ?? '';
  }

  private async assertMember(tripId: number, userId: number): Promise<void> {
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });

    if (!member || member.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You are not a member of this trip');
    }
  }
}

/**
 * One leg's road geometry: its steps' GeoJSON `[lng, lat]` coordinates joined
 * end to end. Consecutive steps share their junction point, so each step after
 * the first drops its leading coordinate when it repeats the previous one.
 */
function legPoints(steps: MapboxStep[]): LatLng[] {
  const points: LatLng[] = [];
  for (const step of steps) {
    for (const [longitude, latitude] of step.geometry?.coordinates ?? []) {
      const last = points[points.length - 1];
      if (last && last.latitude === latitude && last.longitude === longitude) {
        continue;
      }
      points.push({ latitude, longitude });
    }
  }
  return points;
}

function straightLineLegs(pins: PlanRoutePinDto[]): PlanRouteLegDto[] {
  return legModes(pins).map((mode) => ({
    polyline: null,
    durationSec: null,
    distanceM: null,
    mode,
  }));
}

/** Walk or drive for each consecutive pair of pins (`WALK_MAX_STRAIGHT_KM`). */
function legModes(pins: PlanRoutePinDto[]): PlanRouteLegMode[] {
  return pins
    .slice(1)
    .map((pin, i) =>
      haversineKm(pins[i], pin) < WALK_MAX_STRAIGHT_KM ? 'walk' : 'drive',
    );
}

/**
 * Groups consecutive legs with the same mode. `from`/`to` are pin indexes: a
 * run covering legs i..j spans pins i..j+1.
 */
function modeRuns(
  modes: PlanRouteLegMode[],
): { mode: PlanRouteLegMode; from: number; to: number }[] {
  const runs: { mode: PlanRouteLegMode; from: number; to: number }[] = [];
  modes.forEach((mode, i) => {
    const last = runs[runs.length - 1];
    if (last && last.mode === mode) last.to = i + 1;
    else runs.push({ mode, from: i, to: i + 1 });
  });
  return runs;
}

/**
 * Splits pins into chunks of at most `maxSize`, each chunk overlapping the
 * previous one by exactly one pin (the chunk boundary), so that stitching
 * each chunk's `length - 1` legs back together never drops the leg spanning
 * a chunk boundary. Total legs across all chunks == pins.length - 1.
 */
function chunkPins<T>(pins: T[], maxSize: number): T[][] {
  if (pins.length <= maxSize) return [pins];

  const chunks: T[][] = [];
  let start = 0;
  while (start < pins.length - 1) {
    const end = Math.min(start + maxSize, pins.length);
    chunks.push(pins.slice(start, end));
    if (end >= pins.length) break;
    start = end - 1;
  }
  return chunks;
}
