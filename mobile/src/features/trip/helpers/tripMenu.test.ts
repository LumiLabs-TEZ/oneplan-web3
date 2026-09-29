import en from '@/i18n/locales/en.json';
import type { TranslateFn } from '@/ui/relativeTime';

import {
  canEditHomeCurrency,
  needsConversionConfirm,
  startTripBody,
  tripDatesLabel,
  tripMenuItems,
  type TripMenuContext,
} from './tripMenu';

// Real English catalog + `{{n}}` interpolation, without booting i18next — the assertions
// below then read as the rendered English strings.
const table = en as Record<string, string>;
const t: TranslateFn = (key, options) =>
  (table[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ''));

const base: TripMenuContext = {
  isCreator: true,
  status: 'PLANNING',
  homeSymbol: 'đ',
  localSymbol: null,
  datesLabel: 'Trip dates · Set',
  canEditHomeCurrency: true,
  t,
};

const ids = (ctx: Partial<TripMenuContext>) =>
  tripMenuItems({ ...base, ...ctx }).map((item) => item.id);

describe('tripMenuItems', () => {
  it('creator + PLANNING shows currencies, dates, start and delete', () => {
    expect(ids({})).toEqual([
      'groupCurrency',
      'localCurrency',
      'tripDates',
      'startTrip',
      'deleteTrip',
    ]);
    const items = tripMenuItems(base);
    // Dividers sit above the primary trip action and above Delete (`TripDetailView.swift:820-884`).
    expect(items.map((i) => i.divider ?? false)).toEqual([false, false, false, true, true]);
  });

  it('creator + ONGOING swaps Start Trip for End trip', () => {
    expect(ids({ status: 'ONGOING' })).toEqual([
      'groupCurrency',
      'localCurrency',
      'tripDates',
      'endTrip',
      'deleteTrip',
    ]);
  });

  it('creator + ENDED drops dates and the primary action', () => {
    expect(ids({ status: 'ENDED', canEditHomeCurrency: false })).toEqual([
      'groupCurrency',
      'localCurrency',
      'deleteTrip',
    ]);
    const items = tripMenuItems({ ...base, status: 'ENDED', canEditHomeCurrency: false });
    expect(items[0]?.dimmed).toBe(true);
    expect(items.at(-1)?.divider ?? false).toBe(false);
  });

  it('non-creator only sees Leave group', () => {
    expect(ids({ isCreator: false })).toEqual(['leaveGroup']);
  });

  it('marks Delete trip destructive', () => {
    expect(tripMenuItems(base).at(-1)).toMatchObject({ id: 'deleteTrip', destructive: true });
  });

  it('labels currencies with the symbols, falling back to Add for a missing local', () => {
    const items = tripMenuItems({ ...base, homeSymbol: '$', localSymbol: '฿' });
    expect(items[0]?.label).toBe('Group currency · $');
    expect(items[1]?.label).toBe('Local currency · ฿');
    expect(tripMenuItems(base)[1]?.label).toBe('Local currency · Add');
  });

  it('falls back to an em dash when the home currency is unknown', () => {
    expect(tripMenuItems({ ...base, homeSymbol: null })[0]?.label).toBe('Group currency · —');
  });

  it('uses the caller-supplied dates label', () => {
    expect(tripMenuItems({ ...base, datesLabel: 'Trip dates · Jan 5 – Jan 9' })[2]?.label).toBe(
      'Trip dates · Jan 5 – Jan 9',
    );
  });
});

describe('tripDatesLabel', () => {
  it('renders both bounds', () => {
    expect(tripDatesLabel('2026-01-05', '2026-01-09', 'en', t)).toBe('Trip dates · Jan 5 – Jan 9');
  });

  it('renders a question mark for a missing end date', () => {
    expect(tripDatesLabel('2026-01-05', null, 'en', t)).toBe('Trip dates · Jan 5 – ?');
  });

  it('prompts to set dates when none exist', () => {
    expect(tripDatesLabel(null, null, 'en', t)).toBe('Trip dates · Set');
    expect(tripDatesLabel(undefined, '2026-01-09', 'en', t)).toBe('Trip dates · Set');
  });
});

describe('canEditHomeCurrency', () => {
  it('is false only once the trip has ended', () => {
    expect(canEditHomeCurrency('PLANNING')).toBe(true);
    expect(canEditHomeCurrency('ONGOING')).toBe(true);
    expect(canEditHomeCurrency('ENDED')).toBe(false);
  });
});

describe('needsConversionConfirm', () => {
  const budget = { id: 1 } as never;
  const expense = { id: 1 } as never;

  it('is true when any money already exists in the trip', () => {
    expect(needsConversionConfirm([budget], [])).toBe(true);
    expect(needsConversionConfirm([], [expense])).toBe(true);
  });

  it('is false for an empty trip', () => {
    expect(needsConversionConfirm([], [])).toBe(false);
  });
});

describe('startTripBody', () => {
  it('only flips the status when the trip is already scheduled', () => {
    expect(startTripBody(null, true)).toEqual({ status: 'ONGOING' });
    expect(startTripBody({ start: new Date(2026, 0, 5), end: null }, true)).toEqual({
      status: 'ONGOING',
    });
  });

  it('sends the picked range as yyyy-MM-dd alongside the status', () => {
    expect(
      startTripBody({ start: new Date(2026, 0, 5), end: new Date(2026, 0, 9) }, false),
    ).toEqual({ status: 'ONGOING', startDate: '2026-01-05', endDate: '2026-01-09' });
  });

  it('defaults a one-day range to start === end', () => {
    expect(startTripBody({ start: new Date(2026, 0, 5), end: null }, false)).toEqual({
      status: 'ONGOING',
      startDate: '2026-01-05',
      endDate: '2026-01-05',
    });
  });

  it('falls back to a status-only body when nothing was picked', () => {
    expect(startTripBody(null, false)).toEqual({ status: 'ONGOING' });
  });
});
