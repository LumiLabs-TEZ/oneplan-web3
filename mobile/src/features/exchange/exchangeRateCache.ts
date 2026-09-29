// In-memory exchange-rate cache with a staleness window and concurrent-fetch
// deduplication. Ported from ios OnePlan/Services/ExchangeRateService.swift;
// the network call is injected so the cache stays pure and testable.

export type FetchRate = (from: string, to: string) => Promise<number>;

export interface ExchangeRateCacheOptions {
  /** Performs `GET /exchange-rates?from=X&to=Y` and resolves with the rate. */
  fetchRate: FetchRate;
  /** Clock in epoch milliseconds; defaults to `Date.now`. */
  now?: () => number;
  /** Entries older than this are ignored and refetched. Default 10 minutes. */
  staleToleranceMs?: number;
}

export interface SeedOptions {
  from: string;
  to: string;
  rate: number;
  /** Epoch ms; defaults to the cache's clock. */
  fetchedAt?: number;
  /** Mirrors the server's `isStale` flag; informational only. */
  isStale?: boolean;
}

interface CacheEntry {
  rate: number;
  fetchedAt: number;
  isStale: boolean;
}

export const DEFAULT_STALE_TOLERANCE_MS = 10 * 60_000;

export class ExchangeRateCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<number>>();
  private readonly fetchRate: FetchRate;
  private readonly now: () => number;
  private readonly staleToleranceMs: number;

  constructor({
    fetchRate,
    now = Date.now,
    staleToleranceMs = DEFAULT_STALE_TOLERANCE_MS,
  }: ExchangeRateCacheOptions) {
    this.fetchRate = fetchRate;
    this.now = now;
    this.staleToleranceMs = staleToleranceMs;
  }

  /**
   * Current rate from → to. `from === to` short-circuits to 1. Serves the
   * cache while an entry is fresher than `staleToleranceMs`; otherwise fetches,
   * deduplicating concurrent calls for the same pair. A stale entry is never
   * served — if the refetch fails the error propagates (caller renders "—").
   */
  async rate(from: string, to: string): Promise<number> {
    if (from === to) return 1;

    const key = cacheKey(from, to);

    const fresh = this.freshEntry(key);
    if (fresh) return fresh.rate;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const task = this.fetchAndCache(from, to, key).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, task);
    return task;
  }

  /** Convenience: amount × rate. */
  async convert(amount: number, from: string, to: string): Promise<number> {
    if (from === to) return amount;
    const r = await this.rate(from, to);
    return amount * r;
  }

  /**
   * Synchronous cache peek. Returns `undefined` if missing or stale. Used by
   * UI to render a best-effort preview without triggering a fetch.
   */
  cachedRate(from: string, to: string): number | undefined {
    if (from === to) return 1;
    return this.freshEntry(cacheKey(from, to))?.rate;
  }

  // MARK: - Test hooks

  /** Seeds the cache with a known rate, as `fetchAndCache` would after success. */
  seedForTesting({ from, to, rate, fetchedAt, isStale = false }: SeedOptions): void {
    this.cache.set(cacheKey(from, to), {
      rate,
      fetchedAt: fetchedAt ?? this.now(),
      isStale,
    });
  }

  /** Number of pending fetches. */
  get inflightCountForTesting(): number {
    return this.inflight.size;
  }

  // MARK: - Internals

  private freshEntry(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.fetchedAt >= this.staleToleranceMs) return undefined;
    return entry;
  }

  private async fetchAndCache(from: string, to: string, key: string): Promise<number> {
    const rate = await this.fetchRate(from, to);
    this.cache.set(key, { rate, fetchedAt: this.now(), isStale: false });
    return rate;
  }
}

function cacheKey(from: string, to: string): string {
  return `${from}->${to}`;
}
