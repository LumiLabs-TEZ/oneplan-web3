import { commitDisplayName } from './displayName';

describe('commitDisplayName', () => {
  it('commits a changed, trimmed value', () => {
    expect(commitDisplayName('Ken', '  Ken Nguyen  ')).toEqual({
      commit: true,
      value: 'Ken Nguyen',
    });
  });

  it('is a no-op when the trimmed edit equals the trimmed original', () => {
    expect(commitDisplayName('  Ken  ', 'Ken')).toEqual({ commit: false });
  });

  it('is a no-op when the edit is empty', () => {
    expect(commitDisplayName('Ken', '')).toEqual({ commit: false });
  });

  it('is a no-op when the edit is whitespace-only', () => {
    expect(commitDisplayName('Ken', '   ')).toEqual({ commit: false });
  });

  it('commits when the original was empty and the edit is not', () => {
    expect(commitDisplayName('', 'Ken')).toEqual({ commit: true, value: 'Ken' });
  });
});
