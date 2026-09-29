import {
  applyFilterChoice,
  durationFilter,
  filterChipTitle,
  filterChoices,
  isFilterSelected,
} from './filters';

it('uses exactly the SwiftUI duration ranges and retains other filters', () => {
  expect(durationFilter({ tag: 'FRIENDS', budgetSort: 'ASC' }, 2)).toEqual({
    tag: 'FRIENDS',
    budgetSort: 'ASC',
    durationMinDays: 8,
    durationMaxDays: 14,
  });
});
it('clearing duration removes both bounds', () => {
  expect(durationFilter({ durationMinDays: 1, durationMaxDays: 3 }, undefined)).toEqual({
    durationMinDays: undefined,
    durationMaxDays: undefined,
  });
});

describe('isFilterSelected / filterChipTitle', () => {
  it('shows the generic names while nothing is selected', () => {
    expect(filterChipTitle({}, 'duration')).toBe('Duration');
    expect(filterChipTitle({}, 'companions')).toBe('Companion');
    expect(filterChipTitle({}, 'budget')).toBe('Budget');
    expect(isFilterSelected({}, 'duration')).toBe(false);
  });

  it('swaps to the chosen value once selected (SwiftUI `title(for:)`)', () => {
    expect(filterChipTitle({ durationMinDays: 4, durationMaxDays: 7 }, 'duration')).toBe(
      '4-7 days',
    );
    expect(filterChipTitle({ tag: 'COUPLES' }, 'companions')).toBe('Couples');
    expect(filterChipTitle({ budgetSort: 'ASC' }, 'budget')).toBe('Ascending');
    expect(filterChipTitle({ budgetSort: 'DESC' }, 'budget')).toBe('Descending');
    expect(isFilterSelected({ budgetSort: 'DESC' }, 'budget')).toBe(true);
  });
});

describe('filterChoices', () => {
  it('lists None first and checkmarks the active duration range', () => {
    expect(filterChoices({ durationMinDays: 8, durationMaxDays: 14 }, 'duration')).toEqual([
      { id: 'none', titleKey: 'None', selected: false },
      { id: 'duration:0', titleKey: '1-3 days', selected: false },
      { id: 'duration:1', titleKey: '4-7 days', selected: false },
      { id: 'duration:2', titleKey: '8-14 days', selected: true },
    ]);
  });

  it('checkmarks None until a tag is chosen, in the iOS menu order', () => {
    const choices = filterChoices({}, 'companions');
    expect(choices.map((choice) => choice.id)).toEqual([
      'none',
      'tag:COMPANY',
      'tag:COUPLES',
      'tag:FAMILY',
      'tag:FRIENDS',
      'tag:SOLO',
    ]);
    expect(choices[0]?.selected).toBe(true);
    expect(filterChoices({ tag: 'FAMILY' }, 'companions')[3]?.selected).toBe(true);
  });

  it('offers ascending/descending budget sorting', () => {
    expect(filterChoices({ budgetSort: 'DESC' }, 'budget')).toEqual([
      { id: 'none', titleKey: 'None', selected: false },
      { id: 'budget:ASC', titleKey: 'Ascending', selected: false },
      { id: 'budget:DESC', titleKey: 'Descending', selected: true },
    ]);
  });
});

describe('applyFilterChoice', () => {
  it('None clears only that filter', () => {
    expect(
      applyFilterChoice(
        { tab: 'TRENDING', tag: 'FRIENDS', budgetSort: 'ASC' },
        'companions',
        'none',
      ),
    ).toEqual({ tab: 'TRENDING', tag: undefined, budgetSort: 'ASC' });
    expect(
      applyFilterChoice({ durationMinDays: 1, durationMaxDays: 3 }, 'duration', 'none'),
    ).toEqual({ durationMinDays: undefined, durationMaxDays: undefined });
    expect(applyFilterChoice({ budgetSort: 'DESC' }, 'budget', 'none')).toEqual({
      budgetSort: undefined,
    });
  });

  it('applies range, tag, and sort choices', () => {
    expect(applyFilterChoice({}, 'duration', 'duration:1')).toEqual({
      durationMinDays: 4,
      durationMaxDays: 7,
    });
    expect(applyFilterChoice({}, 'companions', 'tag:COUPLES')).toEqual({ tag: 'COUPLES' });
    expect(applyFilterChoice({}, 'budget', 'budget:DESC')).toEqual({ budgetSort: 'DESC' });
  });

  it('ignores ids that do not belong to the filter', () => {
    expect(applyFilterChoice({ tag: 'SOLO' }, 'companions', 'duration:2')).toEqual({ tag: 'SOLO' });
  });
});
