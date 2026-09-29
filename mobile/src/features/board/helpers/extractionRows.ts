import type { ExtractedPin } from '../types';

/**
 * One FlashList row on the extraction screen. A "Day N" divider is its own row (not nested in the
 * pin cell) so pin cells stay one recyclable shape. `order` is the pin's position in the stream —
 * a divider shares its pin's, so both animate in together when that pin arrives.
 */
export type ExtractionRow =
  | { type: 'divider'; key: string; dayNumber: number; order: number }
  | { type: 'pin'; key: string; pin: ExtractedPin; order: number };

/** A divider precedes each pin that starts a new narrated day (`dayNumber > 0`). */
export function flattenExtractionRows(pins: readonly ExtractedPin[]): ExtractionRow[] {
  const rows: ExtractionRow[] = [];
  pins.forEach((pin, order) => {
    const day = pin.dayNumber;
    if (day != null && day > 0 && pins[order - 1]?.dayNumber !== day) {
      rows.push({ type: 'divider', key: `divider:${pin.index}`, dayNumber: day, order });
    }
    rows.push({ type: 'pin', key: `pin:${pin.index}`, pin, order });
  });
  return rows;
}
