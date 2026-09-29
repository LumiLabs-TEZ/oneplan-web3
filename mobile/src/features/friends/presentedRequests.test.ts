import { firstUnshownRequestId, liveRequests, presentedRequests } from './presentedRequests';

afterEach(() => {
  presentedRequests.reset();
  liveRequests.reset();
});

describe('presentedRequests', () => {
  it('records ids once', () => {
    presentedRequests.add(4);
    presentedRequests.add(4);
    expect(presentedRequests.has(4)).toBe(true);
    expect(presentedRequests.has(5)).toBe(false);
  });

  it('keeps only the most recent 200 ids', () => {
    for (let id = 1; id <= 205; id++) presentedRequests.add(id);
    expect(presentedRequests.has(5)).toBe(false);
    expect(presentedRequests.has(6)).toBe(true);
    expect(presentedRequests.has(205)).toBe(true);
  });
});

describe('liveRequests', () => {
  it('records ids received over the websocket this session', () => {
    liveRequests.add(4);
    liveRequests.add(4);
    expect(liveRequests.ids()).toEqual([4]);
    liveRequests.reset();
    expect(liveRequests.ids()).toEqual([]);
  });
});

describe('firstUnshownRequestId', () => {
  it('returns the first live id not yet presented', () => {
    expect(firstUnshownRequestId([{ id: 1 }, { id: 2 }], [1], [1, 2])).toBe(2);
  });

  it('ignores requests that were only fetched (never received live)', () => {
    expect(firstUnshownRequestId([{ id: 1 }, { id: 2 }], [], [2])).toBe(2);
    expect(firstUnshownRequestId([{ id: 1 }, { id: 2 }], [], [])).toBeNull();
  });

  it('returns null when everything has been presented or there is nothing', () => {
    expect(firstUnshownRequestId([{ id: 1 }], [1], [1])).toBeNull();
    expect(firstUnshownRequestId([], [], [])).toBeNull();
    expect(firstUnshownRequestId(undefined, [], [1])).toBeNull();
  });
});
