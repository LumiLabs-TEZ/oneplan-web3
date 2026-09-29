/**
 * Settle every open share with one counterparty (`POST /trips/{tripId}/expenses/settlements/settle`).
 * The response is the whole refreshed summary, so it is written straight into the settlements
 * cache; the breakdown/expenses totals shift too and are invalidated.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';

import type { TripSettlementSummaryDto } from './queries';

export type SettleCounterpartyDto = components['schemas']['SettleCounterpartyDto'];

export async function settleCounterparty(
  tripId: number,
  body: SettleCounterpartyDto,
  api: ApiClient = defaultApi,
): Promise<TripSettlementSummaryDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/expenses/settlements/settle', {
    params: { path: { tripId } },
    body,
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export function useSettleCounterparty(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SettleCounterpartyDto) => settleCounterparty(tripId, body, api),
    onSuccess: (summary) => {
      queryClient.setQueryData(keys.trips.settlements(tripId), summary);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.trips.breakdown(tripId) }),
        queryClient.invalidateQueries({ queryKey: keys.trips.expenses(tripId) }),
        // Settling an ended trip can complete the trip_settled mission.
        queryClient.invalidateQueries({ queryKey: keys.missions }),
      ]);
    },
  });
}
