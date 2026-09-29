/**
 * Live FX for the amount keypad caption (`AddExpenseView.swift:118-145`): the rate is a
 * TanStack query (1 h stale) so it is shared/deduped across screens; the caption converts the
 * debounced amount so it repaints synchronously from cache and settles 200 ms after typing stops.
 */
import { useQuery } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

type CurrencyCode = components['schemas']['Currency'];
export type ExchangeRateResponseDto = components['schemas']['ExchangeRateResponseDto'];

export async function fetchExchangeRate(
  from: CurrencyCode,
  to: CurrencyCode,
  api: ApiClient = defaultApi,
): Promise<ExchangeRateResponseDto> {
  const { data, response } = await api.GET('/exchange-rates', {
    params: { query: { from, to } },
  });
  if (!response.ok || !data) throw new Error(`exchange-rate ${response.status}`);
  return data;
}

export function useExchangeRate(from: string | null | undefined, to: string | null | undefined) {
  const enabled = Boolean(from && to && from !== to);
  return useQuery({
    queryKey: keys.exchangeRate(from ?? '', to ?? ''),
    queryFn: () => fetchExchangeRate(from as CurrencyCode, to as CurrencyCode),
    enabled,
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  });
}

export interface ConvertedAmount {
  /** `null` until a rate is known (caller renders nothing / "—"). */
  amount: number | null;
  rate: number | null;
  isStale: boolean;
}

export function useConvertedAmount(
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
  debounceMs = 200,
): ConvertedAmount {
  const debounced = useDebouncedValue(amount, debounceMs);
  const rate = useExchangeRate(from, to);
  if (from && to && from === to) return { amount: debounced, rate: 1, isStale: false };
  if (!rate.data) return { amount: null, rate: null, isStale: false };
  return {
    amount: debounced * rate.data.rate,
    rate: rate.data.rate,
    isStale: Boolean(rate.data.isStale),
  };
}
