/**
 * Maps a free-text POI category name (Foursquare `PlacePrediction.category`, or a
 * reverse-geocode fallback) — or an already-resolved `ExpenseCategory` wire value — to one of
 * the category illustrations in `src/ui/assets.ts`. Keyword matching is delegated to
 * `poiCategory.ts`'s `expenseCategoryForPoi` (mirrors iOS `CategoryChip.Category.from(poiCategory:)`)
 * so display and the wire value sent to the server never diverge; this module only adds the
 * exact-enum passthrough and the `'OTHER'` display default on top.
 */
import type { components } from '@/api/schema';
import { svg } from '@/ui/assets';

import { expenseCategoryForPoi } from './poiCategory';

export type CategoryIllustration = (typeof svg.categories)[keyof typeof svg.categories];
export type CategoryIllustrationKey = components['schemas']['ExpenseCategory'];

/** The `ExpenseCategory` enum values themselves (keys of `svg.categories`) — e.g. plan-item
 * `category` fields passed straight through from the server. Checked before the free-text
 * keyword matching below so an exact enum value like `'STAY'` or `'PARK'` never falls through
 * keyword-matching (which would mis-bucket most of them into `OTHER`). */
const CATEGORY_ENUM_VALUES = new Set<string>(Object.keys(svg.categories));

/** `null`/empty/unrecognized falls through to the default (`OTHER`) key. Split from
 * `categoryIllustration` so render call sites can do `svg.categories[categoryIllustrationKey(x)]`
 * — a plain member access, matching `TripHistoryList`'s `svg.categories[entry.category ?? 'OTHER']`
 * — instead of assigning a function call's return value straight into a capitalized JSX variable
 * (flagged by `react-hooks/static-components` as a component "created during render"). */
export function categoryIllustrationKey(name: string | null): CategoryIllustrationKey {
  return matchedCategoryIllustrationKey(name) ?? 'OTHER';
}

/** Like `categoryIllustrationKey` but `null` when nothing matches — for call sites that show
 * their own fallback (the location cards' `appLogoCutout`, mirroring iOS
 * `Image(item.imageName ?? "appLogoCutout")`). */
export function matchedCategoryIllustrationKey(
  name: string | null,
): CategoryIllustrationKey | null {
  const trimmed = (name ?? '').trim();
  if (CATEGORY_ENUM_VALUES.has(trimmed)) return trimmed as CategoryIllustrationKey;
  return expenseCategoryForPoi(trimmed) ?? null;
}

/** `null`/empty/unrecognized falls through to the default (`OTHER`) illustration. Non-JSX
 * call sites (tests, or code that isn't rendering the result directly) can use this; JSX render
 * sites should use `categoryIllustrationKey` + `svg.categories[key]` instead (see above). */
export function categoryIllustration(name: string | null): CategoryIllustration {
  return svg.categories[categoryIllustrationKey(name)];
}
