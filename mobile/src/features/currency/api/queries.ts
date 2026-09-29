/**
 * Supported-currency catalog — port of `CurrencyCatalogService.swift` (`GET /currencies`,
 * with the bundled `Currency.fallbackCurrencies` used until/unless the call lands).
 *
 * The catalog effectively never changes within a session, so it is cached forever and seeded
 * with the static table via `placeholderData`: the picker renders instantly and still works
 * offline. Consumers should read `data ?? CURRENCY_CATALOG_FALLBACK` so a *failed* request
 * (where TanStack Query clears the placeholder) also falls back.
 */
import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';
import { HttpError } from '@/features/trip/api/queries';
import { fallbackCurrencies } from '@/lib/currency';

export type CurrencyDto = components['schemas']['CurrencyDto'];

/** `Currency.fallbackCurrencies` mapped into the DTO shape (same order — VND first). */
export const CURRENCY_CATALOG_FALLBACK: readonly CurrencyDto[] = fallbackCurrencies.map((c) => ({
  code: c.code as CurrencyDto['code'],
  name: c.name,
  symbol: c.symbol,
  decimalPlaces: c.decimalPlaces,
}));

export async function fetchCurrencies(api: ApiClient = defaultApi): Promise<CurrencyDto[]> {
  const { data, error, response } = await api.GET('/currencies');
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError('GET /currencies', response.status, error ?? null);
  }
  return data;
}

export function useCurrencies() {
  return useQuery({
    queryKey: keys.currencies,
    queryFn: () => fetchCurrencies(),
    staleTime: Infinity,
    placeholderData: CURRENCY_CATALOG_FALLBACK as CurrencyDto[],
  });
}
