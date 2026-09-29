/**
 * Distance label for the location-detail screen — port of `LocationDetailView.distanceText`
 * (`ios/OnePlan/OnePlan/View/LocationDetailView.swift:739-753`): under 1 km rounds to 50 m,
 * under 10 km shows one decimal, beyond that whole km. Units hug the number (`4.3km`).
 */
import type { AppLanguage } from '@/stores/settingsStore';

export function formatLocationDistance(meters: number, locale: AppLanguage): string {
  if (meters < 1000) {
    const rounded = Math.round(meters / 50) * 50;
    return `${numberFormatter(locale, 'whole').format(rounded)}m`;
  }
  const km = meters / 1000;
  if (km < 10) return `${numberFormatter(locale, 'tenths').format(km)}km`;
  return `${numberFormatter(locale, 'whole').format(Math.round(km))}km`;
}

// One `Intl.NumberFormat` per (language, precision) — constructing one per call is the costly
// part, and the label is re-derived on every render.
const formatters = new Map<string, Intl.NumberFormat>();

function numberFormatter(locale: AppLanguage, precision: 'tenths' | 'whole'): Intl.NumberFormat {
  const cacheKey = `${locale}|${precision}`;
  let formatter = formatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(
      locale === 'vi' ? 'vi-VN' : 'en-US',
      precision === 'tenths' ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : undefined,
    );
    formatters.set(cacheKey, formatter);
  }
  return formatter;
}
