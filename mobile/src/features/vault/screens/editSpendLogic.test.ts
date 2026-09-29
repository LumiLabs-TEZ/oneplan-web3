import { resolvedShareWithUserIds, resolvedSpendName } from './editSpendLogic';

describe('resolvedSpendName', () => {
  it('keeps a typed name as-is', () => {
    expect(resolvedSpendName('Coffee run', 'Coffee')).toBe('Coffee run');
  });

  it('trims surrounding whitespace', () => {
    expect(resolvedSpendName('  Coffee run  ', 'Coffee')).toBe('Coffee run');
  });

  it('falls back to the category title when the typed name is empty', () => {
    expect(resolvedSpendName('', 'Coffee')).toBe('Coffee');
  });

  it('falls back to the category title when the typed name is whitespace-only', () => {
    expect(resolvedSpendName('   ', 'Coffee')).toBe('Coffee');
  });
});

describe('resolvedShareWithUserIds', () => {
  it('returns an empty array when shared with all, even if stale ids are present', () => {
    expect(resolvedShareWithUserIds(true, new Set([1, 2, 3]))).toEqual([]);
  });

  it('returns the selected ids when not shared with all', () => {
    expect(resolvedShareWithUserIds(false, new Set([2, 1]))).toEqual([2, 1]);
  });

  it('returns an empty array when not shared with all but nothing is selected', () => {
    expect(resolvedShareWithUserIds(false, new Set())).toEqual([]);
  });
});
