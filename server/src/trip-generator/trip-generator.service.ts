import { createHash } from 'node:crypto';
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContentLocale, Currency, ListingTag } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  GeminiRequestError,
  GeminiService,
} from '../common/gemini/gemini.service';
import { LocationsService } from '../locations/locations.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { StorageService } from '../storage/storage.service';
import { UploadTarget } from '../storage/constants/upload-targets';
import {
  GenerateTripPlanDto,
  TripGeneratorPlanFor,
} from './dto/generate-trip-plan.dto';
import {
  CreateListingFromPlanResultDto,
  GeneratedPlanItemDto,
  GenerateTripPlanResultDto,
  GeneratedTripPlanDto,
} from './dto/generated-plan.dto';
import { ActivityClass, classifyActivityForItem } from './activity-hints';
import {
  appleMapsLink,
  appleMapsSearchLink,
  CollectedImage,
  collectImages,
  CollectImagesStats,
  destinationRelevanceTokens,
  geocodeCity,
  haversineKm,
  ImageResult,
  imageRelevanceTokens,
  LatLng,
  MAX_CITY_RADIUS_KM,
  nominatimSearch,
  resolvePlace,
  UsedImages,
} from './place-lookup';
import { ImageGate, reviewImageTitle } from './image-relevance';
import { PrismaService } from '../prisma/prisma.service';
import {
  BackfillListingImagesResultDto,
  SyncListingImagesResultDto,
} from './dto/generated-plan.dto';
import { reviewImagesWithVision } from './image-vision-review';

// planFor -> the ListingTag used to tag the generated marketplace listing.
const PLAN_FOR_TO_TAG: Record<TripGeneratorPlanFor, ListingTag> = {
  Friends: ListingTag.FRIENDS,
  Family: ListingTag.FAMILY,
  'Company trip': ListingTag.COMPANY,
  Couple: ListingTag.COUPLES,
  Solo: ListingTag.SOLO,
};

// MARKET_ITEM_IMAGE only accepts these; scraped gifs are skipped for listings.
const LISTING_IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const MAX_IMAGES_PER_ITEM = 5;

// Strongest first; 404 (model not available to the project) or 429 (quota)
// falls through to the next one.
const MODEL_CHAIN = [
  'gemini-3-pro-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
];
const GENERATE_TIMEOUT_MS = 4 * 60_000;
const PLAN_TTL_MS = 2 * 60 * 60_000;
const MAX_STORED_PLANS = 100;
const MAP_LOOKUP_CONCURRENCY = 3;
const IMAGE_CONCURRENCY = 4;
const IMAGES_PER_PLACE = 5;

export const CURRENCY_DISPLAY_NAMES: Record<Currency, string> = {
  VND: 'Vietnamese Dong',
  USD: 'US Dollar',
  EUR: 'Euro',
  JPY: 'Japanese Yen',
  KRW: 'Korean Won',
  THB: 'Thai Baht',
  SGD: 'Singapore Dollar',
  MYR: 'Malaysian Ringgit',
  CNY: 'Chinese Yuan',
  TWD: 'New Taiwan Dollar',
};

// Gemini wants UPPERCASE string types in response schemas.
const PLAN_SCHEMA = {
  type: 'OBJECT',
  required: ['trip_name', 'trip_description', 'days'],
  propertyOrdering: ['trip_name', 'trip_description', 'days'],
  properties: {
    trip_name: { type: 'STRING' },
    trip_description: { type: 'STRING' },
    days: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['day', 'plans'],
        propertyOrdering: ['day', 'plans'],
        properties: {
          day: { type: 'INTEGER' },
          plans: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: [
                'time',
                'name',
                'place_name',
                'address',
                'description',
                'image_query',
              ],
              propertyOrdering: [
                'time',
                'name',
                'place_name',
                'address',
                'description',
                'image_query',
              ],
              properties: {
                time: {
                  type: 'STRING',
                  description: '24h HH:MM suggested start time',
                },
                name: {
                  type: 'STRING',
                  description:
                    'Plan name shown to the user, in the requested output language',
                },
                place_name: {
                  type: 'STRING',
                  description:
                    'The real venue name exactly as it appears on the map (original language). Empty string for pure transit or abstract items.',
                },
                address: {
                  type: 'STRING',
                  description:
                    'Full street address incl. city and country, Latin script. Empty string for pure transit or abstract items.',
                },
                description: {
                  type: 'STRING',
                  description:
                    'Description + recommendation + how to find it if hard to find + cost estimate, in the requested output language',
                },
                image_query: {
                  type: 'STRING',
                  description:
                    'Web image search query that would return photos of THIS venue doing THIS activity. Shape: "<venue name> <city> <what the photo must show>". The last part is decided by the activity, never by the venue type: eating -> the dishes ("street food dishes Chatuchak Market Bangkok"), coffee -> the drinks and the cafe space, shopping -> the stalls, sightseeing -> the view, sleeping -> the room. Two plans at the same place MUST have different queries. Never a bare city name and never a landmark that is not part of this plan item: a city panorama is not a photo of a dinner.',
                },
              },
            },
          },
        },
      },
    },
  },
};

interface RawPlanItem {
  time: string;
  name: string;
  place_name: string;
  address: string;
  description: string;
  image_query: string;
}

interface RawPlan {
  trip_name: string;
  trip_description: string;
  days: { day: number; plans: RawPlanItem[] }[];
}

interface StoredPlan {
  plan: GeneratedTripPlanDto;
  input: GenerateTripPlanDto;
  createdAt: number;
}

// Schema for the repair pass: real in-city replacements for places that could
// not be verified in the destination city.
const REPAIR_SCHEMA = {
  type: 'OBJECT',
  required: ['items'],
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['index', 'name', 'place_name', 'address', 'description'],
        propertyOrdering: [
          'index',
          'name',
          'place_name',
          'address',
          'description',
          'image_query',
        ],
        properties: {
          index: {
            type: 'INTEGER',
            description: 'The 1-based number of the place being replaced',
          },
          name: { type: 'STRING' },
          place_name: { type: 'STRING' },
          address: { type: 'STRING' },
          description: { type: 'STRING' },
          image_query: { type: 'STRING' },
        },
      },
    },
  },
};

interface RepairItem {
  index: number;
  name?: string;
  place_name?: string;
  address?: string;
  description?: string;
  image_query?: string;
}

function csvField(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function safeName(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

@Injectable()
export class TripGeneratorService {
  private readonly logger = new Logger(TripGeneratorService.name);
  private readonly plans = new Map<string, StoredPlan>();

  constructor(
    private readonly gemini: GeminiService,
    private readonly locations: LocationsService,
    private readonly marketplace: MarketplaceService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  /* --------------------------- Generation --------------------------- */

  async generate(dto: GenerateTripPlanDto): Promise<GenerateTripPlanResultDto> {
    const { raw, model } = await this.generateRawPlan(dto);
    const plan = this.toDto(raw);
    const ref = await geocodeCity(dto.destination);
    await this.resolveMapLinks(plan, dto.destination, ref);
    await this.enforceSameCity(plan, dto, ref);

    this.prunePlans();
    const id = randomUUID();
    this.plans.set(id, { plan, input: dto, createdAt: Date.now() });
    return { id, model, plan };
  }

  private async generateRawPlan(
    dto: GenerateTripPlanDto,
  ): Promise<{ raw: RawPlan; model: string }> {
    const prompt = this.buildPrompt(dto);
    let lastErr: unknown = null;
    for (const modelId of MODEL_CHAIN) {
      // One retry per model for the (rare with responseSchema) invalid-JSON case.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const raw = await this.gemini.generateJsonFromText<RawPlan>({
            prompt,
            responseSchema: PLAN_SCHEMA,
            signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
            temperature: 0.7,
            modelId,
            maxOutputTokens: 65536,
          });
          if (!raw?.days?.length) {
            throw new UnprocessableEntityException(
              'Gemini returned an empty plan',
            );
          }
          return { raw, model: modelId };
        } catch (e) {
          lastErr = e;
          if (e instanceof GeminiRequestError) {
            if (e.vertexStatus === 404 || e.vertexStatus === 429) break; // next model
            throw e;
          }
          if (e instanceof UnprocessableEntityException) continue; // retry once
          throw e;
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new UnprocessableEntityException('Trip plan generation failed');
  }

  private buildPrompt(input: GenerateTripPlanDto): string {
    const {
      destination,
      days,
      budget,
      planFor,
      vibe,
      language,
      tripName,
      numberOfPeople,
    } = input;
    const currency = CURRENCY_DISPLAY_NAMES[input.currency];
    return `You are OnePlan's trip planning engine. Create a complete, realistic trip itinerary.

INPUT
- Destination: ${destination}
- Duration: ${days} day(s)
- Group size: ${numberOfPeople ? `${numberOfPeople} people` : '(not specified)'}
- Budget per person: ${budget} ${currency} (total per person for the whole trip)
- Plan for: ${planFor} (one of Friends, Family, Company trip, Couple, Solo)
- Desired vibe / special requests: ${vibe ? vibe : '(none, use your judgement)'}
- Output language: ${language}
${tripName ? `- Trip name requested by user: ${tripName} (use it as trip_name)` : ''}

Every INPUT above is a hard constraint from the user. Honor the destination, the exact duration, the group size, the budget, the group type and the vibe together, so the plan reads as if it was made specifically for THIS group, not a generic city guide.

REQUIREMENTS
1. Target audience is young travelers (18-32): trendy, photogenic, fun places mixed with must-see spots.
1b. GROUP-TYPE STRUCTURE for "${planFor}" (this changes the SHAPE of the trip, not just the wording):
   - Couple: SLOW pace, 4-6 plans/day, start late (first plan 08:30+), one private sunset/viewpoint, cozy dinner, one couple-only experience (workshop, night stroll). Avoid crowded rush-hour spots and 05:00 starts.
   - Friends: FAST pace, 6-7 plans/day, the EVENING is the climax (night market, bar street), photogenic group spots, street food to share, one playful competitive activity. Avoid long museums.
   - Family: STEADY pace, 5-6 plans/day with a REAL midday rest (60-90 min), multi-generation friendly spots, short transfers, spacious restaurants. Avoid long treks, late nights, exotic-only menus.
   - Company trip: structured mornings together with clear meet times, free-time blocks in the afternoon, one organized team-bonding activity, restaurants that seat the whole group. Avoid tiny-capacity venues.
   - Solo: FLEXIBLE, 5-6 plans/day, mix in sociable spots (free walking tour, food tour, community cafe), safe areas at night. Avoid deserted late-night areas.
   A reader should be able to GUESS the group type from the structure alone.
1c. STORY RHYTHM: each day has exactly ONE highlight (the "climax" attraction); other plans are warm-up, meals, and wind-down around it. The three meals anchor the day; local specialties must appear at least once per day with the real dish name and venue.
${numberOfPeople ? `1d. GROUP SIZE = ${numberOfPeople} people. Pick venues that comfortably seat and suit this many: for a large group (5+) prefer spacious restaurants, group-bookable activities and dishes meant to be shared, and mention "for a group of ${numberOfPeople}" in the relevant cost estimates; for 1-2 people prefer intimate, counter-seat or single-table spots. Never send a big group to a tiny 2-seat cafe or a couple to a 20-person banquet hall. Where a per-group price matters (private car, boat, table booking), note both the group total and the per-person share in ${currency}.` : ''}
2. Use ONLY real, currently operating places that EXIST ON APPLE MAPS and can be found by name. Prefer well-known, established venues over obscure hole-in-the-wall spots that may not be mapped. For each place give its real full street address (street number + street + district + city + country) in Latin script.
2b. CRITICAL: EVERY place must be physically located IN "${destination}" (the same city). Do NOT include any place in a different city, even if its name references "${destination}" (for example, for a Quang Ngai trip never pick a restaurant named "Quang Ngai" that is actually in Ho Chi Minh City). Beware trendy cafes/studios from Hanoi, Saigon or Da Nang: a stylish venue you remember probably belongs to a BIG city, not to "${destination}"; when in doubt pick a famous local specialty spot instead. Do NOT invent places or guess: if you are not certain a specific venue is real and in "${destination}", choose a different well-known place there that you ARE certain about.
3. Number of plans per day follows the group-type structure in 1b (meals included). Give each a realistic 24h start time (HH:MM), and leave breathing room: do not pack plans back-to-back with zero buffer.
4. ONE-WAY ROUTE each day: cluster nearby places and order them along a single direction; never make the group backtrack more than 30 minutes. Note travel between areas in descriptions when relevant.
5. Stay within the total budget of ${budget} ${currency} per person including food, tickets, and local transport (exclude flights and hotel unless the budget is clearly large enough). End each plan description with a short cost estimate in ${currency}, or state it is free, written in ${language}.
6. Each plan description: 1-3 sentences, warm and casual tone, include what to eat/do/order (a concrete recommendation), and if the place is hard to find, add a short tip on how to find it (entrance, alley, floor, landmark). All in ${language}.
7. trip_name: short and catchy. trip_description: 1-2 sentences selling the trip. Both in ${language}.
8. Vibe: if the user provided a vibe, it is the strongest signal, pick places matching it above all defaults.
9. Plan names: in ${language}, but keep the proper name of the venue recognizable (e.g. keep the venue's real name, optionally with a translated descriptor). place_name: the venue's exact real-world map name, unchanged.
9b. IMAGES: image_query must describe what a PHOTO of this plan should show, not just where it is. The subject follows the ACTIVITY: a meal -> the dishes on the table, a coffee stop -> cups and the cafe space, a market -> the stalls, a viewpoint -> the scenery, a homestay -> the room. Never send a city panorama, a famous waterfall or a hotel photo for a meal or a coffee stop; a wrong photo makes the whole plan worthless.
10. days array must contain exactly ${days} day objects, day numbered 1..${days}.`;
  }

  private toDto(raw: RawPlan): GeneratedTripPlanDto {
    return {
      tripName: raw.trip_name,
      tripDescription: raw.trip_description,
      days: raw.days.map((d) => ({
        day: d.day,
        plans: d.plans.map((p) => ({
          time: p.time ?? '',
          name: p.name ?? '',
          placeName: p.place_name ?? '',
          address: p.address ?? '',
          description: p.description ?? '',
          imageQuery: p.image_query ?? '',
          mapLink: '',
          resolved: false,
          resolvedName: '',
        })),
      })),
    };
  }

  // Resolve one plan item to a real, same-city location (or an address search
  // fallback). Mutates the item in place.
  private async resolveItem(
    p: GeneratedPlanItemDto,
    destination: string,
    ref: LatLng | null,
  ): Promise<void> {
    if (!p.address) return;
    const resolved = await resolvePlace(
      p.placeName || p.name,
      p.address,
      destination,
      ref,
      p.imageQuery,
    );
    if (resolved) {
      p.mapLink = appleMapsLink(resolved.place);
      p.resolved = true;
      p.resolvedName = resolved.place.mapkitName;
      p.latitude = resolved.place.coordinates.latitude;
      p.longitude = resolved.place.coordinates.longitude;
    } else {
      p.resolved = false;
      p.resolvedName = '';
      p.latitude = undefined;
      p.longitude = undefined;
      // Address-first search: reliable even when the venue name is obscure.
      p.mapLink = appleMapsSearchLink(p.address);
    }
  }

  private async resolveMany(
    items: GeneratedPlanItemDto[],
    destination: string,
    ref: LatLng | null,
  ): Promise<void> {
    let idx = 0;
    const worker = async () => {
      while (idx < items.length) {
        await this.resolveItem(items[idx++], destination, ref);
      }
    };
    await Promise.all(
      Array.from({ length: MAP_LOOKUP_CONCURRENCY }, () => worker()),
    );
  }

  // Resolve every plan item to a real, SAME-CITY Apple Maps location. Each
  // place must resolve within MAX_CITY_RADIUS_KM of the destination center, so
  // a place merely named after the destination but sitting in another city is
  // rejected. Resolved places get a coordinate pin link (cannot 404).
  private async resolveMapLinks(
    plan: GeneratedTripPlanDto,
    destination: string,
    ref: LatLng | null,
  ): Promise<void> {
    const items = plan.days.flatMap((d) => d.plans);
    await this.resolveMany(items, destination, ref);
    // Safety net when the destination could not be geocoded: reject geographic
    // outliers relative to the median of resolved points.
    if (!ref) this.dropOutliers(items);
  }

  private dropOutliers(
    items: GeneratedTripPlanDto['days'][number]['plans'],
  ): void {
    const pts = items.filter(
      (p) => p.resolved && p.latitude != null && p.longitude != null,
    );
    if (pts.length < 3) return;
    const median = (nums: number[]): number => {
      const s = [...nums].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const center = {
      latitude: median(pts.map((p) => p.latitude as number)),
      longitude: median(pts.map((p) => p.longitude as number)),
    };
    for (const p of pts) {
      const c = {
        latitude: p.latitude as number,
        longitude: p.longitude as number,
      };
      if (haversineKm(center, c) > MAX_CITY_RADIUS_KM) {
        p.resolved = false;
        p.resolvedName = '';
        p.latitude = undefined;
        p.longitude = undefined;
        p.mapLink = appleMapsSearchLink(p.address);
      }
    }
  }

  // After resolution, fix places that could not be confirmed in the destination
  // city (the model occasionally suggests a place from another city, e.g. a
  // Tuy Hoa cafe in a Quang Ngai plan). First it asks the model for real
  // in-city replacements and re-resolves them; then it DROPS any place still
  // unresolved that is confirmed to sit in a different city.
  private async enforceSameCity(
    plan: GeneratedTripPlanDto,
    dto: GenerateTripPlanDto,
    ref: LatLng | null,
  ): Promise<void> {
    if (!ref) return; // cannot verify a city without a center

    const allItems = plan.days.flatMap((d) => d.plans);
    const suspects: { p: GeneratedPlanItemDto; day: number }[] = [];
    for (const d of plan.days) {
      for (const p of d.plans) {
        if (p.address && !p.resolved) suspects.push({ p, day: d.day });
      }
    }
    if (suspects.length === 0) return;

    // 1) Repair (best-effort). Skip if almost nothing resolved (systemic issue,
    // do not mass-replace) to avoid rewriting the whole plan.
    if (suspects.length <= allItems.length * 0.6) {
      try {
        const fixes = await this.repairPlaces(dto, suspects);
        const byIndex = new Map(fixes.map((f) => [f.index, f]));
        suspects.forEach((s, i) => {
          const f = byIndex.get(i + 1);
          if (!f?.place_name) return;
          s.p.name = f.name || s.p.name;
          s.p.placeName = f.place_name;
          s.p.address = f.address || s.p.address;
          s.p.description = f.description || s.p.description;
          s.p.imageQuery = f.image_query || s.p.imageQuery;
        });
        await this.resolveMany(
          suspects.map((s) => s.p),
          dto.destination,
          ref,
        );
      } catch (e) {
        this.logger.warn(
          `Trip repair pass failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // 2) Drop places still unresolved AND confirmed to be in another city.
    for (const d of plan.days) {
      const kept: GeneratedPlanItemDto[] = [];
      for (const p of d.plans) {
        if (!p.address || p.resolved) {
          kept.push(p);
          continue;
        }
        const venue = p.placeName || p.name;
        // First give the venue a fair chance as a LOCAL branch: a qualified
        // "<venue>, <destination>" lookup keeps legit chain branches ("The
        // Coffee House" in town) that a global lookup would place far away.
        const local = await nominatimSearch(`${venue}, ${dto.destination}`);
        if (
          local &&
          haversineKm(ref, local.coordinates) <= MAX_CITY_RADIUS_KM
        ) {
          p.mapLink = appleMapsSearchLink(`${venue}, ${dto.destination}`);
          kept.push(p);
          continue; // verified in-city after all
        }
        // No local hit: if the name resolves ANYWHERE far away, this is a
        // transplanted venue (a Hanoi cafe in a Cao Bang plan) — drop it.
        // Applies to generic names too, since the local check above already
        // protected real local branches.
        const elsewhere = await nominatimSearch(venue);
        if (
          elsewhere &&
          haversineKm(ref, elsewhere.coordinates) > MAX_CITY_RADIUS_KM
        ) {
          this.logger.log(
            `Dropped out-of-city place "${venue}" from ${dto.destination} plan`,
          );
          continue; // drop confirmed wrong-city place
        }
        // Unverifiable anywhere (tiny local stall not on maps): keep, but
        // force the search into the destination city so the link never opens
        // in the wrong place.
        p.mapLink = appleMapsSearchLink(`${venue}, ${dto.destination}`);
        kept.push(p);
      }
      d.plans = kept;
    }
  }

  // Ask the model for real, well-known replacements located in the destination
  // city for the suspect places. Returns corrections keyed by 1-based index.
  private async repairPlaces(
    dto: GenerateTripPlanDto,
    suspects: { p: GeneratedPlanItemDto; day: number }[],
  ): Promise<RepairItem[]> {
    const list = suspects
      .map(
        (s, i) =>
          `${i + 1}. day ${s.day}, ${s.p.time} - "${s.p.name}" (place: ${s.p.placeName || 'n/a'}). Context: ${s.p.description}`,
      )
      .join('\n');
    const prompt = `You planned a trip in "${dto.destination}", but these ${suspects.length} places could NOT be verified as real places located in "${dto.destination}". They may be invented, closed, or actually in a DIFFERENT city.

For EACH numbered place below, replace it with a DIFFERENT, real, well-known place that is genuinely located in "${dto.destination}" (same city), is currently operating, exists on Apple Maps, and fits the same time slot and intent. Keep it close to the other places that day for an easy route.

PLACES TO REPLACE:
${list}

Return one item per number with the SAME index, and: name (in ${dto.language}), place_name (the real venue name as on the map), address (full street address whose city is "${dto.destination}", Latin script), description (1-3 sentences in ${dto.language}, warm tone, with a concrete recommendation and a cost estimate in ${dto.currency}), image_query (image search query shaped "<venue name> <city> <what the photo must show>", where the last part follows the ACTIVITY: eating -> the dishes, coffee -> the drinks and the space, shopping -> the stalls, sightseeing -> the view, sleeping -> the room; never a bare city name).`;

    const res = await this.gemini.generateJsonFromText<{ items: RepairItem[] }>(
      {
        prompt,
        responseSchema: REPAIR_SCHEMA,
        signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
        temperature: 0.5,
        maxOutputTokens: 16384,
      },
    );
    return res.items ?? [];
  }

  private prunePlans(): void {
    const now = Date.now();
    for (const [id, entry] of this.plans) {
      if (now - entry.createdAt > PLAN_TTL_MS) this.plans.delete(id);
    }
    while (this.plans.size >= MAX_STORED_PLANS) {
      let oldest: string | undefined;
      for (const key of this.plans.keys()) {
        oldest = key;
        break;
      }
      if (oldest === undefined) break;
      this.plans.delete(oldest);
    }
  }

  getStored(id: string): StoredPlan {
    const entry = this.plans.get(id);
    if (!entry) {
      throw new NotFoundException(
        'Generated plan not found (plans are kept in memory for 2 hours)',
      );
    }
    return entry;
  }

  /* ------------------------------ CSV ------------------------------ */

  // OnePlan trip template: 13 columns, columns 6-7 empty, trip info
  // (columns 8-13) repeated on every plan row.
  buildCsv(id: string): { filename: string; csv: string } {
    const { plan, input } = this.getStored(id);
    const header = [
      'Day',
      'Time',
      'Plan name',
      'Location Link (Apple Map)',
      'Description',
      '',
      '',
      'Trip name',
      'Description',
      'Duration (days)',
      'Budget (per person)',
      'Plan for',
      'Currency',
    ];
    const rows: unknown[][] = [header];
    for (const day of plan.days) {
      for (const p of day.plans) {
        rows.push([
          day.day,
          p.time,
          p.name,
          p.mapLink,
          p.description,
          '',
          '',
          plan.tripName,
          plan.tripDescription,
          input.days,
          input.budget,
          input.planFor,
          CURRENCY_DISPLAY_NAMES[input.currency],
        ]);
      }
    }
    const csv = rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n';
    return { filename: safeName(plan.tripName || 'trip') + '.csv', csv };
  }

  /* ----------------------------- Images ----------------------------- */

  // What a plan item's photos must show. The activity comes from what the
  // traveler DOES ("bữa tối" -> food), so two plans at the same venue (eat
  // lunch vs browse the stalls at Chatuchak) never share imagery.
  private imageGate(
    p: GeneratedTripPlanDto['days'][number]['plans'][number],
    destination: string,
  ): { gate: ImageGate; activity: ActivityClass | null } {
    const base = p.resolvedName || p.placeName || p.name;
    const activity = classifyActivityForItem(p.name, p.description);
    return {
      activity,
      gate: {
        venueTokens: imageRelevanceTokens(base),
        destTokens: destinationRelevanceTokens(destination),
        destination,
        activity,
      },
    };
  }

  // Search queries to try, in order. Each later attempt widens the search but
  // NEVER the relevance gate: the last resort is a photo that is honestly of
  // this activity in this region (local food in Cao Bang), never a random
  // pretty picture.
  private imageQueries(
    p: GeneratedTripPlanDto['days'][number]['plans'][number],
    destination: string,
    activity: ActivityClass | null,
  ): string[] {
    const base = p.resolvedName || p.placeName || p.name;
    // Generic venue names ("I am...") have no distinctive tokens to search on;
    // quote the name to force an exact-phrase search instead of matching
    // random pages word by word.
    const venueTerm = imageRelevanceTokens(base).length ? base : `"${base}"`;
    const hint = activity?.hint ?? '';
    const withHint = (q: string) =>
      hint && !q.toLowerCase().includes(hint) ? `${q} ${hint}` : q;

    const queries = [
      withHint(`${venueTerm} ${destination}`),
      p.imageQuery ? withHint(p.imageQuery) : '',
      activity ? `${activity.fallback} ${destination}` : '',
    ];
    return [...new Set(queries.filter(Boolean))];
  }

  // Collect photos for one plan item: title gate first (cheap, deterministic),
  // then the vision review (looks at the pixels). Both must clear a photo
  // before it reaches a listing.
  private async gatherItemImages(
    p: GeneratedTripPlanDto['days'][number]['plans'][number],
    destination: string,
    max: number,
    used: UsedImages,
  ): Promise<CollectedImage[]> {
    const { gate, activity } = this.imageGate(p, destination);
    const accept = (r: ImageResult) =>
      reviewImageTitle(r.title, gate).verdict === 'pass';

    const stats: CollectImagesStats = {
      wikimediaResults: 0,
      googleResults: 0,
      ddgResults: 0,
      bingResults: 0,
      candidates: 0,
      ddgRefusals: [],
      errors: [],
    };
    const collected: CollectedImage[] = [];
    for (const query of this.imageQueries(p, destination, activity)) {
      if (collected.length >= max) break;
      const batch = await collectImages(
        query,
        max - collected.length,
        accept,
        used,
        stats,
      );
      collected.push(...batch);
    }
    // Zero photos used to be invisible in the logs, which is how a whole
    // listing shipped with 3 illustrated items out of 19. Say WHY.
    const detail =
      `wikimedia=${stats.wikimediaResults} google=${stats.googleResults} ddg=${stats.ddgResults} bing=${stats.bingResults} candidates=${stats.candidates}` +
      (stats.ddgRefusals.length
        ? ` ddgRefused=[${stats.ddgRefusals.join(', ')}]`
        : '') +
      (stats.errors.length ? ` errors=[${stats.errors.join('; ')}]` : '');
    if (collected.length === 0) {
      this.logger.warn(`No images for "${p.name}" (${detail})`);
      return collected;
    }
    this.logger.log(
      `Collected ${collected.length} image(s) for "${p.name}" (${detail})`,
    );

    return reviewImagesWithVision(
      this.gemini,
      {
        itemName: p.name,
        placeName: p.resolvedName || p.placeName || '',
        destination,
        activity,
      },
      collected,
      this.logger,
    );
  }

  // One folder per place ("Day<N> - <plan name>"), up to 5 images each.
  async collectPlanImages(id: string): Promise<{
    filename: string;
    folders: { folder: string; images: { name: string; buffer: Buffer }[] }[];
  }> {
    const { plan, input } = this.getStored(id);
    const locations: {
      folder: string;
      plan: GeneratedTripPlanDto['days'][number]['plans'][number];
    }[] = [];
    // One folder per plan ITEM (not per venue): two plans at the same place
    // (eat lunch vs browse the market) get their own activity-specific images.
    const seen = new Set<string>();
    for (const d of plan.days) {
      for (const p of d.plans) {
        if (!p.address) continue;
        const folder = `Day${d.day} - ${safeName(p.name)}`;
        if (seen.has(folder)) continue; // only skip true duplicates
        seen.add(folder);
        locations.push({ folder, plan: p });
      }
    }

    const folders: {
      folder: string;
      images: { name: string; buffer: Buffer }[];
    }[] = [];
    const used: UsedImages = { urls: new Set(), hashes: new Set() };
    let idx = 0;
    const worker = async () => {
      while (idx < locations.length) {
        const loc = locations[idx++];
        const images = await this.gatherItemImages(
          loc.plan,
          input.destination,
          IMAGES_PER_PLACE,
          used,
        );
        folders.push({
          folder: loc.folder,
          images: images.map((img, i) => ({
            name: `image-${i + 1}${img.ext}`,
            buffer: img.buffer,
          })),
        });
      }
    };
    await Promise.all(
      Array.from({ length: IMAGE_CONCURRENCY }, () => worker()),
    );

    return {
      filename: safeName(plan.tripName || 'trip') + '-images.zip',
      folders,
    };
  }

  /* ------------------------- Create listing ------------------------- */

  // Turns a generated plan into a real marketplace listing owned by the
  // requesting user: creates the listing (PENDING_REVIEW), scrapes and uploads
  // place images to storage, then adds one TripPlanMarketItem per plan with
  // its image object keys. Reuses MarketplaceService so the result is a
  // first-class listing that shows up in "My Listings" with images.
  // "5.000.000" / "5,000,000 VND" / "khoảng 3tr" -> numeric price per person.
  // Free text with no usable digits (e.g. "Linh hoạt") stays 0.
  private parseBudgetAmount(budget: string): number {
    const digits = (budget.match(/\d/g) ?? []).join('');
    if (!digits) return 0;
    const n = Number(digits);
    return Number.isSafeInteger(n) ? n : 0;
  }

  // Location ids for the listing: exact ids from the request when given,
  // otherwise best-effort name match on the destination's first segment
  // ("Phú Yên, Vietnam" -> "Phú Yên"). Never blocks listing creation.
  private async resolveListingLocation(
    input: GenerateTripPlanDto,
  ): Promise<{ cityId?: number; stateId?: number; countryId?: number }> {
    if (input.cityId || input.stateId || input.countryId) {
      return {
        cityId: input.cityId,
        stateId: input.stateId,
        countryId: input.countryId,
      };
    }
    try {
      const query = input.destination.split(',')[0].trim();
      const hit = (await this.locations.searchLocations(query, 1))[0] as
        | {
            city?: { id: number };
            state?: { id: number };
            country?: { id: number };
          }
        | undefined;
      if (!hit) return {};
      return {
        cityId: hit.city?.id,
        stateId: hit.state?.id,
        countryId: hit.country?.id,
      };
    } catch {
      return {}; // listing vẫn tạo được, admin điền tay như cũ
    }
  }

  async createListing(
    id: string,
    userId: number,
  ): Promise<CreateListingFromPlanResultDto> {
    const { plan, input } = this.getStored(id);

    const location = await this.resolveListingLocation(input);
    const listing = await this.marketplace.createListing(
      userId,
      {
        name: plan.tripName.slice(0, 255),
        description: plan.tripDescription
          ? plan.tripDescription.slice(0, 500)
          : undefined,
        price: this.parseBudgetAmount(input.budget),
        currency: input.currency,
        durationDays: plan.days.length,
        tags: [PLAN_FOR_TO_TAG[input.planFor]],
        ...location,
      },
      // The generated text is in the requested output language, not the
      // dashboard's browser language.
      input.language === 'Tiếng Việt' ? ContentLocale.vi : ContentLocale.en,
    );

    // Flat, ordered list of items (sortOrder is per-day position).
    const items = plan.days.flatMap((day) =>
      day.plans.map((p, i) => ({ day: day.day, sortOrder: i, plan: p })),
    );

    // Scrape + upload images per item concurrently; keep results keyed by index
    // so item creation below stays in order. `used` is shared across items so
    // no two plans in the listing ever carry the same photo.
    const imageKeys: string[][] = items.map(() => []);
    const used: UsedImages = { urls: new Set(), hashes: new Set() };
    let idx = 0;
    let imageCount = 0;
    const worker = async () => {
      while (idx < items.length) {
        const at = idx++;
        const p = items[at].plan;
        if (!p.address) continue; // transit items get no images
        const images = await this.gatherItemImages(
          p,
          input.destination,
          MAX_IMAGES_PER_ITEM,
          used,
        );
        const keys: string[] = [];
        for (const img of images) {
          if (keys.length >= MAX_IMAGES_PER_ITEM) break;
          if (!LISTING_IMAGE_CONTENT_TYPES.has(img.contentType)) continue;
          try {
            keys.push(
              await this.storage.uploadBuffer(
                UploadTarget.MARKET_ITEM_IMAGE,
                listing.id,
                img.buffer,
                img.contentType,
              ),
            );
          } catch {
            // skip a bad upload, keep going for the rest
          }
        }
        imageKeys[at] = keys;
        imageCount += keys.length;
      }
    };
    await Promise.all(
      Array.from({ length: IMAGE_CONCURRENCY }, () => worker()),
    );

    // Use the first scraped image as the listing cover so the card is not blank.
    const cover = imageKeys.find((keys) => keys.length > 0)?.[0];
    if (cover) {
      await this.marketplace.updateListing(listing.id, userId, {
        coverImageUrl: cover,
      });
    }

    // Create items in order.
    let itemCount = 0;
    for (let i = 0; i < items.length; i++) {
      const { day, sortOrder, plan: p } = items[i];
      const hasCoords = p.latitude != null && p.longitude != null;
      await this.marketplace.createItem(listing.id, userId, {
        dayNumber: day,
        title: (p.name || p.placeName || 'Plan').slice(0, 255),
        description: p.description ? p.description.slice(0, 500) : undefined,
        location: p.placeName ? p.placeName.slice(0, 500) : undefined,
        latitude: hasCoords ? (p.latitude as number) : undefined,
        longitude: hasCoords ? (p.longitude as number) : undefined,
        address: p.address ? p.address.slice(0, 500) : undefined,
        startTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)
          ? p.time
          : undefined,
        imageUrls: imageKeys[i],
        sortOrder,
      });
      itemCount++;
    }

    this.logger.log(
      `Created listing ${listing.id} ("${listing.name}", ${itemCount} items, ${imageCount} images) from generated plan ${id}`,
    );
    return {
      listingId: listing.id,
      publicId: listing.publicId,
      name: listing.name,
      itemCount,
      imageCount,
    };
  }

  // Re-run image collection for the items of an existing listing that ended
  // up with fewer than `minImages` photos (a search-engine refusal mid-run
  // leaves the tail of a listing bare). Only touches items below the
  // threshold, keeps their existing photos, and deliberately does NOT flip an
  // APPROVED listing back to review: adding photos changes no text.
  async backfillListingImages(
    listingId: number,
    userId: number,
    minImages = 1,
    dedupe = false,
    recheck = false,
  ): Promise<BackfillListingImagesResultDto> {
    const listing = await this.marketplace.getListing(
      listingId,
      userId,
      'edit',
    );
    const destination = [
      listing.cityName,
      listing.stateName,
      listing.countryName,
    ]
      .filter(Boolean)
      .join(', ');
    if (!destination) {
      throw new NotFoundException(
        'Listing has no location to search images for',
      );
    }

    const rows = await this.prisma.tripPlanMarketItem.findMany({
      where: { listingId },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        address: true,
        imageUrls: true,
      },
      orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }],
    });

    // Seed the dedupe set with the photos the listing already carries, so a
    // second pass never re-uploads a byte-identical file (the first version of
    // this endpoint did exactly that on listing #172). Hashing needs the
    // bytes: fetch each existing image once through its public URL.
    const used: UsedImages = { urls: new Set(), hashes: new Set() };
    const hashByKey = new Map<string, string>();
    const bytesByKey = new Map<
      string,
      { buffer: Buffer; contentType: string }
    >();
    const publicUrls = new Map<string, string>();
    for (const item of listing.items) {
      for (const url of item.imageUrls) {
        publicUrls.set(this.storage.extractObjectKey(url), url);
      }
    }
    await Promise.all(
      rows.flatMap((r) =>
        r.imageUrls.map(async (key) => {
          const url = publicUrls.get(key);
          if (!url) return;
          try {
            const res = await fetch(url, {
              signal: AbortSignal.timeout(20_000),
            });
            if (!res.ok) return;
            const buffer = Buffer.from(await res.arrayBuffer());
            const hash = createHash('md5').update(buffer).digest('hex');
            hashByKey.set(key, hash);
            used.hashes.add(hash);
            bytesByKey.set(key, {
              buffer,
              contentType: (res.headers.get('content-type') ?? 'image/jpeg')
                .split(';')[0]
                .trim(),
            });
          } catch {
            // unreadable existing image: nothing to dedupe against
          }
        }),
      ),
    );

    let itemsDeduped = 0;
    if (dedupe) {
      for (const row of rows) {
        const seen = new Set<string>();
        const kept = row.imageUrls.filter((key) => {
          const hash = hashByKey.get(key);
          if (!hash) return true;
          if (seen.has(hash)) return false;
          seen.add(hash);
          return true;
        });
        if (kept.length !== row.imageUrls.length) {
          await this.prisma.tripPlanMarketItem.update({
            where: { id: row.id },
            data: { imageUrls: kept },
          });
          row.imageUrls = kept;
          itemsDeduped++;
        }
      }
    }

    // Optional second look at photos that are already attached: the review
    // can have been skipped when they were added (Gemini 429 -> "keep what the
    // title gate accepted"), which is how a collage and a watermarked stock
    // shot reached listing #172. Drops only what the reviewer FAILS; keeps
    // everything when the review is unavailable.
    let imagesRemoved = 0;
    if (recheck) {
      for (const row of rows) {
        const existing = row.imageUrls
          .map((key) => {
            const b = bytesByKey.get(key);
            return b
              ? ({
                  ...b,
                  ext: '',
                  url: key,
                  title: '',
                } as CollectedImage)
              : null;
          })
          .filter((x): x is CollectedImage => x !== null);
        if (existing.length === 0) continue;
        const plan = {
          name: row.title,
          placeName: row.location ?? '',
          address: row.address ?? '',
          description: row.description ?? '',
          imageQuery: '',
        } as GeneratedTripPlanDto['days'][number]['plans'][number];
        const { activity } = this.imageGate(plan, destination);
        const kept = await reviewImagesWithVision(
          this.gemini,
          {
            itemName: row.title,
            placeName: row.location ?? '',
            destination,
            activity,
          },
          existing,
          this.logger,
          'hard',
        );
        const keptKeys = new Set(kept.map((k) => k.url));
        const next = row.imageUrls.filter(
          (key) => !bytesByKey.has(key) || keptKeys.has(key),
        );
        if (next.length !== row.imageUrls.length) {
          await this.prisma.tripPlanMarketItem.update({
            where: { id: row.id },
            data: { imageUrls: next },
          });
          imagesRemoved += row.imageUrls.length - next.length;
          row.imageUrls = next;
        }
      }
    }

    const targets = rows.filter((r) => r.imageUrls.length < minImages);
    let itemsUpdated = 0;
    let imagesAdded = 0;
    let idx = 0;
    const worker = async () => {
      while (idx < targets.length) {
        const row = targets[idx++];
        const plan = {
          name: row.title,
          placeName: row.location ?? '',
          address: row.address ?? '',
          description: row.description ?? '',
          imageQuery: '',
        } as GeneratedTripPlanDto['days'][number]['plans'][number];
        const images = await this.gatherItemImages(
          plan,
          destination,
          MAX_IMAGES_PER_ITEM - row.imageUrls.length,
          used,
        );
        const keys: string[] = [];
        for (const img of images) {
          if (row.imageUrls.length + keys.length >= MAX_IMAGES_PER_ITEM) break;
          if (!LISTING_IMAGE_CONTENT_TYPES.has(img.contentType)) continue;
          try {
            keys.push(
              await this.storage.uploadBuffer(
                UploadTarget.MARKET_ITEM_IMAGE,
                listingId,
                img.buffer,
                img.contentType,
              ),
            );
          } catch {
            // skip a bad upload, keep going for the rest
          }
        }
        if (keys.length === 0) continue;
        await this.prisma.tripPlanMarketItem.update({
          where: { id: row.id },
          data: { imageUrls: [...row.imageUrls, ...keys] },
        });
        itemsUpdated++;
        imagesAdded += keys.length;
      }
    };
    await Promise.all(
      Array.from({ length: IMAGE_CONCURRENCY }, () => worker()),
    );

    if (!listing.coverImageUrl && imagesAdded > 0) {
      const first = await this.prisma.tripPlanMarketItem.findFirst({
        where: { listingId, NOT: { imageUrls: { isEmpty: true } } },
        orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }],
        select: { imageUrls: true },
      });
      if (first?.imageUrls[0]) {
        await this.prisma.marketplaceListing.update({
          where: { id: listingId },
          data: { coverImageUrl: first.imageUrls[0] },
        });
      }
    }

    this.logger.log(
      `Backfilled listing ${listingId}: ${itemsUpdated}/${targets.length} bare item(s) got ${imagesAdded} image(s); ${itemsDeduped} item(s) deduped; ${imagesRemoved} image(s) removed by recheck`,
    );
    return {
      listingId,
      itemsChecked: targets.length,
      itemsUpdated,
      imagesAdded,
      itemsDeduped,
      imagesRemoved,
    };
  }

  // A translated twin must carry exactly the photos of its source listing:
  // same itinerary, only the language differs. Items are matched by
  // (day, position within the day); the storage keys are shared, nothing is
  // re-uploaded, and the listing status is left untouched. Refuses when the
  // two itineraries do not line up, so a wrong pairing never scrambles photos.
  async syncListingImagesFrom(
    listingId: number,
    sourceListingId: number,
    userId: number,
  ): Promise<SyncListingImagesResultDto> {
    if (listingId === sourceListingId) {
      throw new BadRequestException('Source and target are the same listing');
    }
    await this.marketplace.getListing(listingId, userId, 'edit');
    await this.marketplace.getListing(sourceListingId, userId, 'edit');

    const load = (id: number) =>
      this.prisma.tripPlanMarketItem.findMany({
        where: { listingId: id },
        select: { id: true, dayNumber: true, sortOrder: true, imageUrls: true },
        orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }],
      });
    const [src, dst] = await Promise.all([
      load(sourceListingId),
      load(listingId),
    ]);

    const byDay = <T extends { dayNumber: number }>(rows: T[]) => {
      const m = new Map<number, T[]>();
      for (const r of rows)
        m.set(r.dayNumber, [...(m.get(r.dayNumber) ?? []), r]);
      return m;
    };
    const srcDays = byDay(src);
    const dstDays = byDay(dst);
    const shape = (m: Map<number, unknown[]>) =>
      [...m.entries()].map(([d, rows]) => `${d}:${rows.length}`).join(',');
    if (shape(srcDays) !== shape(dstDays)) {
      throw new BadRequestException(
        `Itineraries do not line up (source days ${shape(srcDays)} vs target ${shape(dstDays)})`,
      );
    }

    let itemsUpdated = 0;
    let imageCount = 0;
    for (const [day, dstRows] of dstDays) {
      const srcRows = srcDays.get(day) ?? [];
      for (let i = 0; i < dstRows.length; i++) {
        const want = srcRows[i].imageUrls;
        imageCount += want.length;
        const have = dstRows[i].imageUrls;
        if (
          want.length === have.length &&
          want.every((k, j) => k === have[j])
        ) {
          continue;
        }
        await this.prisma.tripPlanMarketItem.update({
          where: { id: dstRows[i].id },
          data: { imageUrls: want },
        });
        itemsUpdated++;
      }
    }

    const source = await this.prisma.marketplaceListing.findUnique({
      where: { id: sourceListingId },
      select: { coverImageUrl: true },
    });
    if (source?.coverImageUrl) {
      await this.prisma.marketplaceListing.update({
        where: { id: listingId },
        data: { coverImageUrl: source.coverImageUrl },
      });
    }

    this.logger.log(
      `Synced images of listing ${listingId} from ${sourceListingId}: ${itemsUpdated} item(s) updated, ${imageCount} image(s) total`,
    );
    return {
      listingId,
      sourceListingId,
      itemsUpdated,
      imageCount,
    };
  }
}
