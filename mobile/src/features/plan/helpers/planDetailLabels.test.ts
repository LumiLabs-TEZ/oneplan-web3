import { initI18n } from '@/i18n';

import { membersLabel, messageLabel, planTimeAndDate, planTitle } from './planDetailLabels';
import type { PlanItemDto } from '../types';

let nextId = 1;
function makeItem(overrides: Partial<PlanItemDto> = {}): PlanItemDto {
  return {
    id: nextId++,
    tripId: 1,
    title: 'Item',
    imageUrls: [],
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    members: [],
    ...overrides,
  };
}

let t: ReturnType<typeof initI18n>['t'];

beforeAll(() => {
  t = initI18n().t;
});

beforeEach(() => {
  nextId = 1;
});

describe('planTitle', () => {
  it('returns the trimmed title', () => {
    expect(planTitle(makeItem({ title: '  Breakfast  ' }), t)).toBe('Breakfast');
  });

  it('falls back to "Untitled Plan" when blank', () => {
    expect(planTitle(makeItem({ title: '   ' }), t)).toBe('Untitled Plan');
  });
});

describe('planTimeAndDate', () => {
  it('combines time and day number in planning mode', () => {
    const item = makeItem({ startTime: '09:30', dayNumber: 2 });
    expect(planTimeAndDate(item, true, 'en', t)).toBe('09:30 - Day 2');
  });

  it('prefers dayNumber over planDate in planning mode', () => {
    const item = makeItem({ startTime: '09:30', dayNumber: 2, planDate: '2026-03-23' });
    expect(planTimeAndDate(item, true, 'en', t)).toBe('09:30 - Day 2');
  });

  it('falls back to planDate in planning mode when dayNumber is missing', () => {
    const item = makeItem({ startTime: '09:30', planDate: '2026-03-23' });
    expect(planTimeAndDate(item, true, 'en', t)).toContain('09:30');
  });

  it('prefers planDate over dayNumber outside planning mode', () => {
    const item = makeItem({ startTime: '09:30', dayNumber: 2, planDate: '2026-03-23' });
    const result = planTimeAndDate(item, false, 'en', t);
    expect(result).not.toContain('Day 2');
    expect(result).toContain('09:30');
  });

  it('returns only the date when time is missing', () => {
    const item = makeItem({ dayNumber: 3 });
    expect(planTimeAndDate(item, true, 'en', t)).toBe('Day 3');
  });

  it('returns only the time when date is missing', () => {
    const item = makeItem({ startTime: '09:30' });
    expect(planTimeAndDate(item, true, 'en', t)).toBe('09:30');
  });

  it('returns "Not set" when neither time nor date resolve', () => {
    const item = makeItem();
    expect(planTimeAndDate(item, true, 'en', t)).toBe('Not set');
  });
});

describe('membersLabel', () => {
  it('returns "No one" when there are no members', () => {
    expect(membersLabel(makeItem({ members: [] }), t)).toBe('No one');
  });

  it('returns the single member name', () => {
    const item = makeItem({
      members: [{ id: 1, userId: 1, displayName: 'Alice' }],
    });
    expect(membersLabel(item, t)).toBe('Alice');
  });

  it('returns a count for multiple members', () => {
    const item = makeItem({
      members: [
        { id: 1, userId: 1, displayName: 'Alice' },
        { id: 2, userId: 2, displayName: 'Bob' },
      ],
    });
    expect(membersLabel(item, t)).toBe('2 members');
  });
});

describe('messageLabel', () => {
  it('returns the trimmed description', () => {
    expect(messageLabel(makeItem({ description: '  Bring cash  ' }), t)).toBe('Bring cash');
  });

  it('falls back to "No message" when blank', () => {
    expect(messageLabel(makeItem({ description: '   ' }), t)).toBe('No message');
  });

  it('falls back to "No message" when missing', () => {
    expect(messageLabel(makeItem(), t)).toBe('No message');
  });
});
