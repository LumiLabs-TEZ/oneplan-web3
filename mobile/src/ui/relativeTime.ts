/** Minimal `t` shape so this helper does not depend on i18next types. */
export type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now" / "5 min ago" / "3 hours ago" / "2 days ago" for the offline banner
 * (iOS: `cachedAt.formatted(.relative(presentation: .named))`).
 *
 * Uses `Intl.RelativeTimeFormat` when the runtime provides it (Hermes does on
 * both platforms in RN 0.86); otherwise falls back to the English-source i18n
 * keys `{{0}} min ago` / `{{0}} hours ago` / `{{0}} days ago`.
 */
export function formatRelativeUpdated(
  ts: number,
  now: number,
  t: TranslateFn,
  locale = 'en',
): string {
  const diff = Math.max(0, now - ts);
  if (diff < MINUTE) return t('just now');

  const [value, unit, fallbackKey]: [number, Intl.RelativeTimeFormatUnit, string] =
    diff < HOUR
      ? [Math.floor(diff / MINUTE), 'minute', '{{0}} min ago']
      : diff < DAY
        ? [Math.floor(diff / HOUR), 'hour', '{{0}} hours ago']
        : [Math.floor(diff / DAY), 'day', '{{0}} days ago'];

  const rtf = relativeTimeFormatter(locale);
  if (rtf) return rtf.format(-value, unit);
  return t(fallbackKey, { 0: value });
}

function relativeTimeFormatter(locale: string): Intl.RelativeTimeFormat | null {
  const Ctor = (globalThis.Intl as Partial<typeof Intl> | undefined)?.RelativeTimeFormat;
  if (typeof Ctor !== 'function') return null;
  try {
    return new Ctor(locale, { numeric: 'always', style: 'long' });
  } catch {
    return null;
  }
}
