/**
 * Maps a free-text POI category name (Foursquare `PlacePrediction.category`, or a
 * reverse-geocode fallback) to an `ExpenseCategory` wire value. Keyword buckets mirror iOS
 * `CategoryChip.Category.from(poiCategory:)` (`ios/OnePlan/OnePlan/Component/Chip/CategoryChip.swift:151-181`),
 * whose switch is driven off `MKPointOfInterestCategory` — translated here to the free-text
 * category names Foursquare/MapKit actually return. RN extends iOS with two buckets Foursquare
 * returns often in Vietnam: hospitals/clinics → `PHARMACY` (the medical illustration) and beauty
 * salons/massage → `SPA`.
 *
 * `null` when nothing matches. Callers must NOT default that to `'OTHER'` before sending it to
 * the server: `CreatePlanItemDto.category` / `UpdatePlanItemDto.category` are a plain
 * `ExpenseCategory` (never `null`), so an unmapped category means "omit the field", not "OTHER".
 * `categoryIllustrationKey` (`categoryIllustration.ts`) reuses this same table and *does* default
 * to `'OTHER'` for display purposes.
 */
import type { components } from '@/api/schema';

export type ExpenseCategory = components['schemas']['ExpenseCategory'];

/** Checked in order — more specific phrases (e.g. "amusement park") must be listed before
 * broader keywords that would otherwise shadow them (e.g. "park"), and "movie theater" before
 * the generic "theater" bucket. */
const KEYWORD_TABLE: readonly (readonly [ExpenseCategory, readonly string[]])[] = [
  ['CINEMA', ['movie theater', 'movie theatre', 'cinema']],
  [
    'TICKET',
    [
      'museum',
      'landmark',
      'monument',
      'attraction',
      'historic',
      'temple',
      'church',
      'gallery',
      'zoo',
      'palace',
      'viewpoint',
      'amusement park',
      'aquarium',
      'stadium',
      'theater',
      'theatre',
    ],
  ],
  ['COFFEE', ['coffee', 'cafe', 'café', 'tea house', 'tea room']],
  [
    'STAY',
    ['hotel', 'resort', 'motel', 'hostel', 'lodging', 'inn', 'guest house', 'campground', 'camp'],
  ],
  ['NIGHT_CLUB', ['night club', 'nightclub', 'nightlife', 'lounge', 'disco']],
  ['GYM', ['gym', 'fitness']],
  [
    'PHARMACY',
    [
      'pharmacy',
      'drugstore',
      'hospital',
      'clinic',
      'medical',
      'urgent care',
      'doctor',
      'dentist',
    ],
  ],
  // Whole-word `spa` (`WHOLE_WORD`) so "Spanish Restaurant" / "Coworking Space" don't match.
  ['SPA', ['spa', 'massage', 'salon', 'beauty', 'nail']],
  ['PARK', ['park', 'garden']],
  [
    'TRANSPORT',
    [
      'airport',
      'public transport',
      'transit',
      'bus station',
      'train station',
      'subway',
      'car rental',
      'ev charg',
      'gas station',
      'parking',
      'taxi',
    ],
  ],
  ['SHOPPING', ['shop', 'store', 'mall', 'market', 'boutique']],
  [
    'FOOD',
    [
      'restaurant',
      'food',
      'diner',
      'bar',
      'bakery',
      'eatery',
      'kitchen',
      'pizza',
      'noodle',
      'grill',
      'bbq',
      'brewery',
      'winery',
    ],
  ],
];

/** Keywords too short to match as a plain substring. */
const WHOLE_WORD = new Set(['spa']);

function matchesAny(name: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) =>
    WHOLE_WORD.has(keyword)
      ? new RegExp(`(^|[^\\p{L}])${keyword}($|[^\\p{L}])`, 'u').test(name)
      : name.includes(keyword),
  );
}

/** `null`/empty/unrecognized returns `null` — never `'OTHER'`. */
export function expenseCategoryForPoi(text: string | null): ExpenseCategory | null {
  const normalized = (text ?? '').trim().toLowerCase();
  if (normalized === '') return null;
  for (const [category, keywords] of KEYWORD_TABLE) {
    if (matchesAny(normalized, keywords)) return category;
  }
  return null;
}
