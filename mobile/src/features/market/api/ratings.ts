/**
 * Marketplace plan rating (`POST /marketplace/listings/{id}/ratings`) — submitted from the
 * trip-end "Trip Plan" card after a buyer applied a plan to a trip that has now ended
 * (`MarketplaceRatingService.swift`). The server re-reads `userMarketplaceRating` on the trip,
 * so a success invalidates the trip detail that owns the listing.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';

export type MarketplaceRatingResponseDto = components['schemas']['MarketplaceRatingResponseDto'];

export async function submitRating(
  listingId: number,
  rating: number,
  api: ApiClient = defaultApi,
): Promise<MarketplaceRatingResponseDto> {
  const { data, error, response } = await api.POST('/marketplace/listings/{id}/ratings', {
    params: { path: { id: listingId } },
    body: { rating },
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export function useSubmitRating(listingId: number, tripId?: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rating: number) => submitRating(listingId, rating, api),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.market.all });
      if (tripId != null) {
        return queryClient.invalidateQueries({ queryKey: keys.trips.detail(tripId) });
      }
      return undefined;
    },
  });
}
