import type { ExtractedPin } from '../types';
import { flattenExtractionRows } from './extractionRows';

const pin = (index: number, dayNumber?: number): ExtractedPin => ({
  index,
  name: `Pin ${index}`,
  dayNumber,
});

it('inserts a divider before each pin that starts a new day', () => {
  const rows = flattenExtractionRows([pin(0, 1), pin(1, 1), pin(2, 2), pin(3)]);
  expect(rows.map((row) => row.key)).toEqual([
    'divider:0',
    'pin:0',
    'pin:1',
    'divider:2',
    'pin:2',
    'pin:3',
  ]);
  expect(rows[3]).toEqual({ type: 'divider', key: 'divider:2', dayNumber: 2, order: 2 });
});

it('never adds dividers for missing or zero day numbers', () => {
  const rows = flattenExtractionRows([pin(0, 0), pin(1), pin(2, 0)]);
  expect(rows.every((row) => row.type === 'pin')).toBe(true);
});

it('shares the pin order with its divider', () => {
  const rows = flattenExtractionRows([pin(4), pin(7, 3)]);
  expect(rows.map((row) => row.order)).toEqual([0, 1, 1]);
});

it('returns no rows for no pins', () => {
  expect(flattenExtractionRows([])).toEqual([]);
});
