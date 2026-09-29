import { availableYears } from './years';

const NOW_2026 = new Date('2026-06-15T00:00:00.000Z');

describe('availableYears', () => {
  it('returns just the current year when memberSince is null', () => {
    expect(availableYears(null, NOW_2026)).toEqual([2026]);
  });

  it('returns the current year down to the memberSince year, descending', () => {
    expect(availableYears('2023-05-01T00:00:00.000Z', NOW_2026)).toEqual([2026, 2025, 2024, 2023]);
  });

  it('returns a single-element array when memberSince is the current year', () => {
    expect(availableYears('2026-02-01T00:00:00.000Z', NOW_2026)).toEqual([2026]);
  });

  it('clamps a future memberSince to the current year (no inverted range)', () => {
    expect(availableYears('2030-01-01T00:00:00.000Z', NOW_2026)).toEqual([2026]);
  });

  it('falls back to just the current year for an unparseable memberSince', () => {
    expect(availableYears('not-a-date', NOW_2026)).toEqual([2026]);
  });

  it('falls back to just the current year for an empty string', () => {
    expect(availableYears('', NOW_2026)).toEqual([2026]);
  });
});
