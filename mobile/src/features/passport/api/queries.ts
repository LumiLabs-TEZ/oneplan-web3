/**
 * Passport summary — `GET /auth/passport`, optionally filtered to a calendar year (by trip end
 * date). Backs the Passport screen's yearly stats (`PassportService.displayedSummary`).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';
import { persistOptions } from '@/offline/persister';

export type PassportSummaryDto = components['schemas']['PassportSummaryDto'];

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function unwrap<T>(label: string, result: FetchResult<T>): T {
  const { data, error, response } = result;
  if (error !== undefined || !response.ok || data === undefined) {
    throw new Error(`${label} failed: ${response.status}`);
  }
  return data;
}

/** `year: null` requests the all-time summary (no `year` query param sent). */
export async function fetchPassportSummary(
  year: number | null,
  api: ApiClient = defaultApi,
): Promise<PassportSummaryDto> {
  return unwrap(
    'GET /auth/passport',
    await api.GET('/auth/passport', {
      params: { query: year !== null ? { year } : {} },
    }),
  );
}

/**
 * `placeholderData: keepPreviousData` keeps the previously-loaded year's card on screen while a
 * new year loads, instead of blanking it (`PassportService.displayedSummary`). Persisted to MMKV
 * (per-year key) so the Profile passport preview and the Passport screen render the last-known
 * summary — with an `OfflineBanner` — instead of a blank/placeholder card when offline.
 */
export function usePassportSummary(year: number | null) {
  return useQuery({
    queryKey: keys.passport(year),
    queryFn: () => fetchPassportSummary(year),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    ...persistOptions(true),
  });
}
