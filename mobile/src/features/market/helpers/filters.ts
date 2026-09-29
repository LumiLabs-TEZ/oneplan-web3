import type { FeedFilters } from '../api/queries';
import { tagLabels } from '../components/ListingCard';

/** Port of `MarketplaceFilterStrip.swift` — chip identity, duration ranges, and tag order. */
export type MarketFilterKind = 'duration' | 'companions' | 'budget';

export const durationRanges = [
  [1, 3],
  [4, 7],
  [8, 14],
] as const;

/** `MarketplaceDurationRange.localizedTitle` — i18n keys, index-aligned with `durationRanges`. */
export const durationLabels = ['1-3 days', '4-7 days', '8-14 days'] as const;

/** `MarketplaceFilterStrip.allTags` menu order (differs from `tagLabels` declaration order). */
export const marketTagOrder = ['COMPANY', 'COUPLES', 'FAMILY', 'FRIENDS', 'SOLO'] as const;

const CHIP_TITLE: Record<MarketFilterKind, string> = {
  duration: 'Duration',
  companions: 'Companion',
  budget: 'Budget',
};

export function durationFilter(filters: FeedFilters, index: number | undefined): FeedFilters {
  const range = index === undefined ? undefined : durationRanges[index];
  return { ...filters, durationMinDays: range?.[0], durationMaxDays: range?.[1] };
}

export function isFilterSelected(filters: FeedFilters, kind: MarketFilterKind): boolean {
  if (kind === 'duration') return filters.durationMinDays !== undefined;
  if (kind === 'companions') return filters.tag !== undefined;
  return filters.budgetSort !== undefined;
}

/** Current chip label — the chosen value when active, the generic name otherwise. */
export function filterChipTitle(filters: FeedFilters, kind: MarketFilterKind): string {
  if (!isFilterSelected(filters, kind)) return CHIP_TITLE[kind];
  if (kind === 'duration') {
    const index = durationRanges.findIndex(([min]) => min === filters.durationMinDays);
    return durationLabels[index === -1 ? 0 : index] ?? CHIP_TITLE.duration;
  }
  if (kind === 'companions') return tagLabels[filters.tag as keyof typeof tagLabels];
  return filters.budgetSort === 'DESC' ? 'Descending' : 'Ascending';
}

export interface FilterChoice {
  /** Menu action id, consumed by {@link applyFilterChoice}. */
  id: string;
  /** i18n key for the action title. */
  titleKey: string;
  selected: boolean;
}

/** Menu actions for a chip: "None" first, then the options with the current one flagged. */
export function filterChoices(filters: FeedFilters, kind: MarketFilterKind): FilterChoice[] {
  const none: FilterChoice = {
    id: 'none',
    titleKey: 'None',
    selected: !isFilterSelected(filters, kind),
  };
  if (kind === 'duration') {
    return [
      none,
      ...durationLabels.map((titleKey, index) => ({
        id: `duration:${index}`,
        titleKey,
        selected: filters.durationMinDays === durationRanges[index]?.[0],
      })),
    ];
  }
  if (kind === 'companions') {
    return [
      none,
      ...marketTagOrder.map((tag) => ({
        id: `tag:${tag}`,
        titleKey: tagLabels[tag],
        selected: filters.tag === tag,
      })),
    ];
  }
  return [
    none,
    { id: 'budget:ASC', titleKey: 'Ascending', selected: filters.budgetSort === 'ASC' },
    { id: 'budget:DESC', titleKey: 'Descending', selected: filters.budgetSort === 'DESC' },
  ];
}

export function applyFilterChoice(
  filters: FeedFilters,
  kind: MarketFilterKind,
  id: string,
): FeedFilters {
  if (id === 'none') {
    if (kind === 'duration') return durationFilter(filters, undefined);
    return kind === 'companions'
      ? { ...filters, tag: undefined }
      : { ...filters, budgetSort: undefined };
  }
  if (kind === 'duration' && id.startsWith('duration:')) {
    return durationFilter(filters, Number(id.slice('duration:'.length)));
  }
  if (kind === 'companions' && id.startsWith('tag:')) {
    const tag = id.slice('tag:'.length) as FeedFilters['tag'];
    return { ...filters, tag };
  }
  if (kind === 'budget' && id.startsWith('budget:')) {
    const budgetSort = id.slice('budget:'.length) as NonNullable<FeedFilters['budgetSort']>;
    return { ...filters, budgetSort };
  }
  return filters;
}
