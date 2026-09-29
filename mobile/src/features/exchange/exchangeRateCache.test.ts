// Unit tests for ExchangeRateCache that do NOT hit the network. `fetchRate` is
// a jest mock; the 9 cases mirror ios OnePlanTests/ExchangeRateServiceTests.swift,
// plus the inflight-dedupe cases Swift could not express without mocking the
// generated OpenAPI client.

import { ExchangeRateCache } from './exchangeRateCache';

const MINUTE = 60_000;

function makeCache(opts: { now?: () => number; fetchRate?: jest.Mock } = {}) {
  const fetchRate =
    opts.fetchRate ??
    jest.fn<Promise<number>, [string, string]>().mockRejectedValue(new Error('offline'));
  const cache = new ExchangeRateCache({ fetchRate, now: opts.now });
  return { cache, fetchRate };
}

describe('ExchangeRateCache', () => {
  // MARK: - Same-currency short-circuit

  test('rate(VND, VND) returns 1 without a fetch', async () => {
    const { cache, fetchRate } = makeCache();
    await expect(cache.rate('VND', 'VND')).resolves.toBe(1);
    expect(fetchRate).not.toHaveBeenCalled();
    expect(cache.inflightCountForTesting).toBe(0);
  });

  test('convert with same currency returns amount unchanged', async () => {
    const { cache, fetchRate } = makeCache();
    await expect(cache.convert(123_456, 'USD', 'USD')).resolves.toBe(123_456);
    expect(fetchRate).not.toHaveBeenCalled();
  });

  // MARK: - cachedRate peek

  test('cachedRate returns undefined when no entry exists', () => {
    const { cache } = makeCache();
    expect(cache.cachedRate('USD', 'VND')).toBeUndefined();
  });

  test('cachedRate returns 1 for same currency without seeding', () => {
    const { cache } = makeCache();
    expect(cache.cachedRate('THB', 'THB')).toBe(1);
  });

  test('cachedRate returns seeded value when fresh', () => {
    const { cache } = makeCache();
    cache.seedForTesting({ from: 'USD', to: 'VND', rate: 24_500 });
    expect(cache.cachedRate('USD', 'VND')).toBe(24_500);
  });

  test('cachedRate returns undefined when entry is past the staleness window', () => {
    const { cache } = makeCache();
    // staleTolerance is 10 minutes; seed 11 minutes in the past.
    cache.seedForTesting({
      from: 'USD',
      to: 'VND',
      rate: 24_500,
      fetchedAt: Date.now() - 11 * MINUTE,
    });
    expect(cache.cachedRate('USD', 'VND')).toBeUndefined();
  });

  // MARK: - Cache hit on rate()

  test('After seeding, rate(...) returns the cached value (no fetch)', async () => {
    const { cache, fetchRate } = makeCache();
    cache.seedForTesting({ from: 'USD', to: 'VND', rate: 24_500 });
    await expect(cache.rate('USD', 'VND')).resolves.toBe(24_500);
    expect(fetchRate).not.toHaveBeenCalled();
    expect(cache.inflightCountForTesting).toBe(0);
  });

  test('Expired cache entry is NOT served — rate(...) refetches and propagates the failure', async () => {
    const { cache, fetchRate } = makeCache();
    cache.seedForTesting({
      from: 'USD',
      to: 'VND',
      rate: 24_500,
      fetchedAt: Date.now() - 11 * MINUTE,
    });
    await expect(cache.rate('USD', 'VND')).rejects.toThrow('offline');
    expect(fetchRate).toHaveBeenCalledWith('USD', 'VND');
    // The failed fetch is cleared from inflight and the stale value stays hidden.
    expect(cache.inflightCountForTesting).toBe(0);
    expect(cache.cachedRate('USD', 'VND')).toBeUndefined();
  });

  // MARK: - Inflight deduplication

  test('Concurrent rate(...) calls that hit cache do NOT create inflight tasks', async () => {
    const { cache, fetchRate } = makeCache();
    cache.seedForTesting({ from: 'USD', to: 'VND', rate: 24_500 });

    const [ra, rb] = await Promise.all([cache.rate('USD', 'VND'), cache.rate('USD', 'VND')]);
    expect(ra).toBe(24_500);
    expect(rb).toBe(24_500);
    expect(fetchRate).not.toHaveBeenCalled();
    expect(cache.inflightCountForTesting).toBe(0);
  });

  // Beyond the Swift suite: the dedupe path itself, now that fetchRate is mockable.

  test('Concurrent uncached calls share one fetch and populate the cache', async () => {
    let resolve!: (v: number) => void;
    const fetchRate = jest.fn<Promise<number>, [string, string]>(
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );
    const { cache } = makeCache({ fetchRate });

    const a = cache.rate('USD', 'VND');
    const b = cache.rate('USD', 'VND');
    expect(cache.inflightCountForTesting).toBe(1);
    expect(fetchRate).toHaveBeenCalledTimes(1);

    resolve(24_500);
    await expect(Promise.all([a, b])).resolves.toEqual([24_500, 24_500]);
    expect(cache.inflightCountForTesting).toBe(0);
    expect(cache.cachedRate('USD', 'VND')).toBe(24_500);
    // Subsequent call is a cache hit.
    await expect(cache.rate('USD', 'VND')).resolves.toBe(24_500);
    expect(fetchRate).toHaveBeenCalledTimes(1);
  });

  test('Different pairs are fetched independently and keyed by direction', async () => {
    const fetchRate = jest.fn(async (from: string, to: string) =>
      from === 'USD' && to === 'VND' ? 24_500 : 1 / 24_500,
    );
    const { cache } = makeCache({ fetchRate });
    await Promise.all([cache.rate('USD', 'VND'), cache.rate('VND', 'USD')]);
    expect(fetchRate).toHaveBeenCalledTimes(2);
    expect(cache.cachedRate('USD', 'VND')).toBe(24_500);
    expect(cache.cachedRate('VND', 'USD')).toBeCloseTo(1 / 24_500);
  });

  test('convert multiplies by the fetched rate and uses the injected clock for freshness', async () => {
    let now = 1_000_000;
    const fetchRate = jest.fn(async () => 2);
    const { cache } = makeCache({ fetchRate, now: () => now });

    await expect(cache.convert(10, 'USD', 'EUR')).resolves.toBe(20);
    now += 10 * MINUTE - 1;
    expect(cache.cachedRate('USD', 'EUR')).toBe(2);
    now += 1;
    expect(cache.cachedRate('USD', 'EUR')).toBeUndefined();
  });
});
