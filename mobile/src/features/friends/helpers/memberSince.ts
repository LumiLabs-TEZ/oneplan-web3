/**
 * "Member since" formatting for the friend-request modals — port of
 * `SendFriendRequestView.swift:176-190` (`memberSinceText` + its three ISO
 * formatters) and the two views' `ringPhrase` builders.
 */
import type { TFunction } from 'i18next';

/**
 * iOS tries three strict formatters (ISO with fractional seconds, ISO, `yyyy-MM-dd`) before
 * falling back to the 4-digit prefix. `new Date()` is far laxer — it happily parses `"2025"` —
 * so the shape is checked first to keep the same three-step fallback.
 */
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;
const YEAR_PREFIX = /^\d{4}/;

function parseMemberSince(iso: string | null | undefined): Date | null {
  if (!iso || !ISO_LIKE.test(iso)) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `PassportStatsBlock`'s mapping — the month name follows the app language. */
function intlLocale(language: string): string {
  return language.startsWith('vi') ? 'vi-VN' : 'en-US';
}

/** Year of a `memberSince` value: parsed date → 4-digit prefix → `null`. */
export function memberSinceYear(iso: string | null | undefined): number | null {
  const date = parseMemberSince(iso);
  if (date) return date.getFullYear();
  const match = iso?.match(YEAR_PREFIX);
  return match ? Number(match[0]) : null;
}

/**
 * `Member since Mar 2025` / `Member since 2025` / `Member since` — the same three-step fallback
 * as iOS. `DisplayFormatters.monthYear` is `.month(.abbreviated).year()`.
 */
export function memberSinceLabel(
  iso: string | null | undefined,
  language: string,
  t: TFunction,
): string {
  const date = parseMemberSince(iso);
  if (date) {
    const monthYear = new Intl.DateTimeFormat(intlLocale(language), {
      month: 'short',
      year: 'numeric',
    }).format(date);
    return t('Member since %@', { 0: monthYear });
  }

  const year = memberSinceYear(iso);
  if (year !== null) return t('Member since %@', { 0: String(year) });

  return t('Member since');
}

/**
 * Rotating-ring caption: `"<NAME> - MEMBER SINCE <year>"` repeated twice with a trailing
 * separator, exactly like both iOS badges (`ringText = "\(phrase) - \(phrase) -"`). Deliberately
 * NOT localized — the ring is a graphic element and iOS hardcodes the English phrase. With no
 * known join year the phrase drops the year rather than inventing one.
 */
export function ringText(name: string, year: number | null): string {
  const normalized = name.trim().toUpperCase();
  const displayName = normalized === '' ? 'MEMBER' : normalized;
  const phrase =
    year === null ? `${displayName} - MEMBER` : `${displayName} - MEMBER SINCE ${year}`;
  return `${phrase} - ${phrase} -`;
}
