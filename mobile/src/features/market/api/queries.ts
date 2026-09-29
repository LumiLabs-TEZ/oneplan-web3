import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components, operations } from '@/api/schema';
import { useAppLanguage } from '@/i18n';

export type Listing = components['schemas']['MarketplaceListingDto'];
export type FeedItem = components['schemas']['MarketplaceFeedItemDto'];
export type FeedFilters = NonNullable<operations['listMarketplaceFeed']['parameters']['query']>;
export type MarketItem = components['schemas']['MarketItemDto'];
export type Acquisition = components['schemas']['MarketplaceAcquisitionDetailDto'];
export type AcquisitionSummary = components['schemas']['MarketplaceAcquisitionSummaryDto'];
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.error || result.data === undefined) {
    throw new ApiMutationError(result.response.status, result.error);
  }
  return result.data;
}
/** Server default page size (`MARKETPLACE_FEED_DEFAULT_TAKE`). */
const FEED_TAKE = 20;

export function useMarketFeed(filters: FeedFilters = {}) {
  const language = useAppLanguage();
  // Spell the default `take` out so Home (`take: 20`) and the Market tab (no take) share one
  // cache entry and one request instead of two identical ones.
  const query = { take: FEED_TAKE, ...filters };
  return useQuery({
    queryKey: [...keys.market.feed(query), language],
    queryFn: async () => unwrap(await api.GET('/marketplace/feed', { params: { query } })),
  });
}
export function useListing(id: string, edit = false) {
  const language = useAppLanguage();
  return useQuery({
    queryKey: [...keys.market.listing(id), language, { edit }],
    enabled: !!id,
    queryFn: async () =>
      unwrap(
        await api.GET('/marketplace/listings/{id}', {
          params: { path: { id }, query: edit ? { context: 'edit' } : {} },
        }),
      ),
  });
}
export function useApplied(id: number | undefined) {
  return useQuery({
    queryKey: keys.market.applied(id ?? 0),
    enabled: !!id,
    queryFn: async () =>
      unwrap(
        await api.GET('/marketplace/listings/{id}/applied', { params: { path: { id: id! } } }),
      ),
  });
}
export function useMyListings() {
  const language = useAppLanguage();
  return useQuery({
    queryKey: [...keys.market.mine, language],
    queryFn: async () => unwrap(await api.GET('/marketplace/listings')),
  });
}
export function useCreator(userId: number) {
  const language = useAppLanguage();
  return useQuery({
    queryKey: [...keys.market.creator(userId), language],
    enabled: userId > 0,
    queryFn: async () =>
      unwrap(await api.GET('/marketplace/creators/{userId}', { params: { path: { userId } } })),
  });
}
export function useAcquisitions() {
  const language = useAppLanguage();
  return useQuery({
    queryKey: [...keys.market.unlocked, language],
    queryFn: async () => unwrap(await api.GET('/marketplace/acquisitions')),
  });
}
export function useAcquisition(id: number) {
  const language = useAppLanguage();
  return useQuery({
    queryKey: [...keys.market.acquisition(id), language],
    enabled: id > 0,
    queryFn: async () =>
      unwrap(await api.GET('/marketplace/acquisitions/{id}', { params: { path: { id } } })),
  });
}
