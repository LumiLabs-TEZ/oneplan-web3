/**
 * Country flag-badge palette — port of `PassportCard.swift` `countryBadges`.
 * Hex values are the rounded equivalents of the SwiftUI RGB-float palette.
 */

export interface CountryBadge {
  flag: string;
  background: string;
}

export interface CountryStat {
  emoji?: string | null;
}

/** red, gold, white, sky-blue, green, forest-green — cycled by index. */
export const FLAG_BADGE_PALETTE: readonly string[] = [
  '#FF3B30',
  '#EBBF2B',
  '#FFFFFF',
  '#73BDFF',
  '#34C759',
  '#179E63',
];

const PLACEHOLDER_FLAGS: readonly string[] = ['🇻🇳', '🇪🇹', '🇵🇪', '🇦🇷', '🇧🇷', '🇳🇬'];

/**
 * `topCountries` from `PassportSummaryDto`, or `null` while loading — falls back to the iOS
 * placeholder flags. `emoji` missing/empty on a real row falls back to 🌐.
 */
function paletteColor(index: number): string {
  return FLAG_BADGE_PALETTE[index % FLAG_BADGE_PALETTE.length] ?? FLAG_BADGE_PALETTE[0]!;
}

export function countryBadges(
  topCountries: readonly CountryStat[] | null | undefined,
  max = 6,
): CountryBadge[] {
  if (topCountries) {
    return topCountries.slice(0, max).map((country, index) => ({
      flag: country.emoji ?? '🌐',
      background: paletteColor(index),
    }));
  }

  return PLACEHOLDER_FLAGS.slice(0, max).map((flag, index) => ({
    flag,
    background: paletteColor(index),
  }));
}
