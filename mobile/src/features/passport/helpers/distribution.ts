/**
 * Top-cities / top-countries distribution-bar helpers — port of
 * `View/Profile/PassportView.swift:247-277`.
 */

export interface PassportDistributionRow {
  label: string;
  count: number;
}

/** `max(12.624, available * count / max(maxCount, 1))` — mirrors the SwiftUI GeometryReader ratio. */
export function barWidth(count: number, maxCount: number, available: number): number {
  const safeMax = Math.max(maxCount, 1);
  const ratio = count / safeMax;
  return Math.max(12.624, available * ratio);
}

/** Zero-padded 2-digit string (`String(format: "%02d", …)`). */
export function pad2(n: number): string {
  return String(Math.max(n, 0)).padStart(2, '0');
}

/** iOS placeholder rows shown while `PassportSummaryDto` is loading. */
export const PLACEHOLDER_SUMMARY: {
  cities: PassportDistributionRow[];
  countries: PassportDistributionRow[];
} = {
  cities: [
    { label: 'Da Lat', count: 10 },
    { label: 'Vung Tau', count: 5 },
    { label: 'Ha Noi', count: 1 },
    { label: 'Bankok', count: 1 },
  ],
  countries: [
    { label: 'Viet Nam', count: 4 },
    { label: 'Thailand', count: 2 },
    { label: 'UAE', count: 1 },
  ],
};
