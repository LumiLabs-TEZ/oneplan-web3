/**
 * Plan-detail display strings. Port of `PlanDetailView.swift` computed
 * properties `planTitle` / `planTimeAndDate` / `planWhoJoin` / `planMessage`
 * (:67-148).
 */
import type { TFunction } from 'i18next';

import { formatMonthDay, parseDateOnly } from '@/features/trip/helpers/dateRange';

import type { PlanItemDto } from '../types';

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formattedPlanDate(planDate: string, locale: 'en' | 'vi'): string {
  const date = parseDateOnly(planDate);
  return Number.isNaN(date.getTime()) ? planDate : formatMonthDay(date, locale);
}

/** Trimmed title, or `t('Untitled Plan')` when blank. */
export function planTitle(item: PlanItemDto, t: TFunction): string {
  return textOrNull(item.title) ?? t('Untitled Plan');
}

/**
 * Planning mode prefers `dayNumber` (`t('Day %lld')`) then falls back to
 * `planDate`; other modes prefer `planDate` then fall back to `dayNumber`.
 * Combined with the start time via `t('%@ - %@')` when both resolve;
 * `t('Not set')` when neither does.
 */
export function planTimeAndDate(
  item: PlanItemDto,
  isPlanningMode: boolean,
  locale: 'en' | 'vi',
  t: TFunction,
): string {
  const time = textOrNull(item.startTime);

  const dayLabel = (): string | null =>
    typeof item.dayNumber === 'number' ? t('Day %lld', { 0: item.dayNumber }) : null;
  const dateLabel = (): string | null =>
    item.planDate ? formattedPlanDate(item.planDate, locale) : null;

  const date = isPlanningMode ? (dayLabel() ?? dateLabel()) : (dateLabel() ?? dayLabel());

  if (time && date) return t('%@ - %@', { 0: time, 1: date });
  if (time) return time;
  if (date) return date;
  return t('Not set');
}

/** `t('No one')` / the sole member's name / `t('%lld members')`. */
export function membersLabel(item: PlanItemDto, t: TFunction): string {
  const members = item.members ?? [];
  if (members.length === 0) return t('No one');
  if (members.length === 1) return members[0]!.displayName;
  return t('%lld members', { count: members.length });
}

/** Trimmed description, or `t('No message')` when blank. */
export function messageLabel(item: PlanItemDto, t: TFunction): string {
  return textOrNull(item.description) ?? t('No message');
}
