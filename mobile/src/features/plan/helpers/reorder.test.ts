import { indexForOffset, moveItem } from './reorder';

describe('moveItem', () => {
  it('moves an item forward, shifting items in between back', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item backward, shifting items in between forward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns a copy (not the same reference) when from === to', () => {
    const list = ['a', 'b'];
    const result = moveItem(list, 0, 0);
    expect(result).toEqual(list);
    expect(result).not.toBe(list);
  });

  it('returns a copy when from is out of bounds', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, -1, 0)).toEqual(list);
    expect(moveItem(list, 2, 0)).toEqual(list);
  });

  it('returns a copy when to is out of bounds', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, 0, -1)).toEqual(list);
    expect(moveItem(list, 0, 5)).toEqual(list);
  });
});

describe('indexForOffset', () => {
  it('returns startIndex when dy is 0', () => {
    expect(indexForOffset(2, 0, 56, 5)).toBe(2);
  });

  it('moves down one row per rowHeight of positive dy', () => {
    expect(indexForOffset(0, 56, 56, 5)).toBe(1);
    expect(indexForOffset(0, 112, 56, 5)).toBe(2);
  });

  it('moves up one row per rowHeight of negative dy', () => {
    expect(indexForOffset(3, -56, 56, 5)).toBe(2);
  });

  it('rounds to the nearest row on a partial drag', () => {
    expect(indexForOffset(0, 30, 56, 5)).toBe(1);
    expect(indexForOffset(0, 20, 56, 5)).toBe(0);
  });

  it('clamps to 0 when dragged above the first row', () => {
    expect(indexForOffset(0, -500, 56, 5)).toBe(0);
  });

  it('clamps to count - 1 when dragged below the last row', () => {
    expect(indexForOffset(0, 500, 56, 5)).toBe(4);
  });

  it('clamps startIndex into range when rowHeight is 0', () => {
    expect(indexForOffset(10, 100, 0, 5)).toBe(4);
    expect(indexForOffset(-1, 100, 0, 5)).toBe(0);
  });

  it('returns 0 when count is 0', () => {
    expect(indexForOffset(0, 100, 56, 0)).toBe(0);
  });
});
