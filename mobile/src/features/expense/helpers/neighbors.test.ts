import { neighborIds } from './neighbors';

describe('neighborIds', () => {
  it('returns prev/next around the current id', () => {
    expect(neighborIds([3, 5, 8], 5)).toEqual({ prev: 3, next: 8 });
    expect(neighborIds([3, 5, 8], 3)).toEqual({ prev: null, next: 5 });
    expect(neighborIds([3, 5, 8], 8)).toEqual({ prev: 5, next: null });
  });
  it('handles an unknown id and single-item lists', () => {
    expect(neighborIds([3, 5], 9)).toEqual({ prev: null, next: null });
    expect(neighborIds([3], 3)).toEqual({ prev: null, next: null });
  });
});
