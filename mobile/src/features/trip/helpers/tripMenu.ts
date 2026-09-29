/**
 * Pure model for the trip-detail ellipsis menu — port of the `Menu { … }` block in
 * `ios/OnePlan/OnePlan/View/Trip/TripDetailView.swift:766-918` plus `tripDatesMenuLabel`
 * (:1154-1166) and `TripDetailService.canEditHomeCurrency` (`TripDetailService.swift:91-93`).
 *
 * Kept UI-free so the row matrix is unit testable; `TripMenuButton` maps ids → native menu actions.
 */
import type { AppLanguage } from '@/stores/settingsStore';
import type { TranslateFn } from '@/ui/relativeTime';

import type { BudgetDto, ExpenseSummaryDto, TripStatus } from '../types';
import type { components } from '@/api/schema';

import {
  formatMonthDay,
  normalizeRange,
  parseDateOnly,
  toDateOnly,
  type DateRange,
} from './dateRange';

type UpdateTripDto = components['schemas']['UpdateTripDto'];

export type TripMenuItemId =
  | 'groupCurrency'
  | 'localCurrency'
  | 'tripDates'
  | 'startTrip'
  | 'endTrip'
  | 'deleteTrip'
  | 'leaveGroup';

export interface TripMenuItem {
  id: TripMenuItemId;
  label: string;
  /** Rendered in red (`Button(role: .destructive)`). */
  destructive?: boolean;
  /** `.foregroundStyle(.secondary)` — the row still reacts to taps (it explains why it's locked). */
  dimmed?: boolean;
  /** A separator is drawn ABOVE this row (iOS 26 `Divider()`). */
  divider?: boolean;
}

export interface TripMenuContext {
  isCreator: boolean;
  status: TripStatus | null | undefined;
  /** `service.homeCurrency?.symbol` — `null` while the trip is loading. */
  homeSymbol: string | null;
  /** `service.primaryLocalCurrency?.symbol` — `null` when no local currency is set. */
  localSymbol: string | null;
  /** Pre-formatted by `tripDatesLabel` (it needs the app locale). */
  datesLabel: string;
  canEditHomeCurrency: boolean;
  t: TranslateFn;
}

export function tripMenuItems(ctx: TripMenuContext): TripMenuItem[] {
  const { t } = ctx;

  if (!ctx.isCreator) {
    return [{ id: 'leaveGroup', label: t('Leave group') }];
  }

  const isPlanning = ctx.status === 'PLANNING';
  const isOngoing = ctx.status === 'ONGOING';
  const showsPrimaryTripAction = isPlanning || isOngoing;

  const items: TripMenuItem[] = [
    {
      id: 'groupCurrency',
      label: t('Group currency · %@', { 0: ctx.homeSymbol ?? '—' }),
      dimmed: !ctx.canEditHomeCurrency,
    },
    {
      id: 'localCurrency',
      label: t('Local currency · %@', { 0: ctx.localSymbol ?? t('Add') }),
    },
  ];

  if (showsPrimaryTripAction) {
    items.push({ id: 'tripDates', label: ctx.datesLabel });
  }

  if (isPlanning) {
    items.push({ id: 'startTrip', label: t('Start Trip Now'), divider: true });
  } else if (isOngoing) {
    items.push({ id: 'endTrip', label: t('End trip'), divider: true });
  }

  items.push({
    id: 'deleteTrip',
    label: t('Delete trip'),
    destructive: true,
    divider: showsPrimaryTripAction,
  });

  return items;
}

/** `tripDatesMenuLabel` (`TripDetailView.swift:1154-1166`). Dates are `yyyy-MM-dd` strings. */
export function tripDatesLabel(
  start: string | null | undefined,
  end: string | null | undefined,
  locale: AppLanguage,
  t: TranslateFn,
): string {
  if (!start) return t('Trip dates · Set');
  const startLabel = formatMonthDay(parseDateOnly(start), locale);
  if (!end) return t('Trip dates · %@ – ?', { 0: startLabel });
  return t('Trip dates · %@ – %@', {
    0: startLabel,
    1: formatMonthDay(parseDateOnly(end), locale),
  });
}

/** `TripDetailService.canEditHomeCurrency` — the group currency freezes once the trip ends. */
export function canEditHomeCurrency(status: TripStatus | null | undefined): boolean {
  return status !== 'ENDED';
}

/**
 * A group-currency switch re-converts every stored amount, so it needs an explicit confirm
 * once the trip holds any money (`TripDetailView.swift` currency-change alert).
 */
export function needsConversionConfirm(
  budgets: readonly BudgetDto[],
  expenses: readonly ExpenseSummaryDto[],
): boolean {
  return budgets.length > 0 || expenses.length > 0;
}

/**
 * `startTripIfPossible` payload (`TripDetailView.swift:1602-1614`): when the trip already
 * carries both dates the status flips alone so the server keeps them; otherwise the freshly
 * picked range rides along.
 */
export function startTripBody(range: DateRange | null, alreadyScheduled: boolean): UpdateTripDto {
  const status: UpdateTripDto['status'] = 'ONGOING';
  if (alreadyScheduled) return { status };
  const normalized = range ? normalizeRange(range) : null;
  if (!normalized) return { status };
  return {
    status,
    startDate: toDateOnly(normalized.start),
    endDate: toDateOnly(normalized.end),
  };
}
