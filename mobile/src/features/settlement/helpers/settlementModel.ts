/**
 * Pure model behind the trip-end breakdown.
 *
 * Ports `TripEndBreakdownItem.swift:70-101` (`rowKey`, `directionLabel`, the expanded item's
 * signed amount), `TripEndLeaveSettlementItem.swift:163-169` (`totalShare` / `isAllSettled`)
 * and `TripEndHistory.swift:52-83` (`computedDurationDays`).
 */
import type { components } from '@/api/schema';
import { formatWhole } from '@/lib/currency';
import type { TranslateFn } from '@/ui/relativeTime';

type CounterpartySettlementDto = components['schemas']['CounterpartySettlementDto'];
type SettlementItemDto = components['schemas']['SettlementItemDto'];
type LeaveSettlementDto = components['schemas']['LeaveSettlementDto'];
type TripBreakdownDto = components['schemas']['TripBreakdownDto'];
type TripDto = components['schemas']['TripDto'];
type PlanItemDto = components['schemas']['PlanItemDto'];

export type SettlementDirection = CounterpartySettlementDto['direction'];
/** How the trip-end screen was entered (route param `mode`). */
export type TripEndMode = 'flow' | 'ended' | 'leaving';

/**
 * Stable list identity: the same person can appear as both a receivable and a payable,
 * so the key carries the direction too.
 */
export function rowKey(settlement: CounterpartySettlementDto): string {
  return `${settlement.direction === 'receive' ? 'r' : 'p'}-${settlement.counterpartyUserId}`;
}

/** Receive rows swap to the longer phrasing once expanded; pay rows never change. */
export function directionLabel(
  direction: SettlementDirection,
  expanded: boolean,
  t: TranslateFn,
): string {
  if (direction !== 'receive') return t('Transfer to');
  return expanded ? t('You receive from') : t('Receive from');
}

export interface ItemAmountDisplay {
  text: string;
  /** `text`'s parts for the animated `MoneyText` (whole amount, symbol drawn after it). */
  sign: '+' | '-';
  amount: number;
  tone: 'green' | 'orange';
}

/** `+1,500,000đ` (they owe you) vs `-200,000đ` (you owe them / the group wallet). */
export function itemAmountText(item: SettlementItemDto, symbol: string): ItemAmountDisplay {
  const sign = item.owedToYou ? '+' : '-';
  return {
    text: `${sign}${formatWhole(item.shareAmount)}${symbol}`,
    sign,
    amount: item.shareAmount,
    tone: item.owedToYou ? 'green' : 'orange',
  };
}

export interface LeaveTotals {
  totalShare: number;
  isAllSettled: boolean;
}

/** Σ of the leaving member's expense shares; settled only when nothing is open AND the net is 0. */
export function leaveTotals(settlement: LeaveSettlementDto): LeaveTotals {
  const totalShare = settlement.expenses.reduce((sum, e) => sum + e.shareAmount, 0);
  const isAllSettled =
    settlement.expenses.every((e) => e.isSettled) && settlement.netSettlement === 0;
  return { totalShare, isAllSettled };
}

const MS_PER_DAY = 86_400_000;

/** `yyyy-MM-dd` prefix parsed as UTC midnight — the wire format is either a date or an ISO stamp. */
function parseDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** Inclusive day span of the trip; falls back to the highest plan-item day, then to 1. */
export function durationDays(trip: TripDto | undefined, planItems: readonly PlanItemDto[]): number {
  const start = parseDay(trip?.startDate);
  const end = parseDay(trip?.endDate);
  if (start !== null && end !== null) {
    return Math.max(Math.round((end - start) / MS_PER_DAY) + 1, 1);
  }
  const maxDay = planItems.reduce((max, p) => Math.max(max, p.dayNumber ?? 0), 0);
  return Math.max(maxDay, 1);
}

/**
 * Parses the `settlement` route param written by `LeaveTripSheet`. Validates the shape rather
 * than trusting the JSON: a malformed/stale param must degrade to "no leave card" instead of
 * crashing or leaving the Breakdown tab in a permanent loading state.
 */
export function parseLeaveSettlement(raw: string | undefined | null): LeaveSettlementDto | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const dto = parsed as Partial<LeaveSettlementDto>;
  if (!Array.isArray(dto.expenses)) return null;
  if (typeof dto.netSettlement !== 'number' || !Number.isFinite(dto.netSettlement)) return null;
  if (typeof dto.displayName !== 'string') return null;
  if (dto.expenses.some((e) => typeof e?.shareAmount !== 'number')) return null;
  return dto as LeaveSettlementDto;
}

/**
 * Hero status count. A leaving member only ever settles with the group, so their card is
 * always exactly one outstanding settlement (`TripEndBreakdown.swift:51`).
 */
export function unsettledCountFor(
  mode: TripEndMode,
  breakdown: TripBreakdownDto | undefined,
  fallback: number,
): number {
  if (mode === 'leaving') return 1;
  return breakdown?.unsettledCount ?? fallback;
}
