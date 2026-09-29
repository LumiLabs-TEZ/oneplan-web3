/**
 * Subscription mutations: validate an Apple StoreKit 2 JWS, verify+acknowledge a Google Play
 * purchase, fetch the StoreKit app-account-token, and force-resync from the App Store. All throw
 * `ApiMutationError` (status + body) so callers can branch on `/subscription/sync`'s `400` (no
 * linked subscription) vs `503` (Apple unavailable), and never `finishTransaction`/acknowledge a
 * purchase before the corresponding validate/verify call resolves (constraints.md).
 */
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';

import type { SubscriptionStatusDto } from '../types';

type VerifyPlayPurchaseDto = components['schemas']['VerifyPlayPurchaseDto'];

export async function validateAppleTransaction(
  jws: string,
  api: ApiClient = defaultApi,
): Promise<SubscriptionStatusDto> {
  const { data, error, response } = await api.POST('/subscription/validate', { body: { jws } });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function verifyPlayPurchase(
  body: VerifyPlayPurchaseDto,
  api: ApiClient = defaultApi,
): Promise<SubscriptionStatusDto> {
  const { data, error, response } = await api.POST('/subscription/play/verify', { body });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function fetchAppAccountToken(api: ApiClient = defaultApi): Promise<string> {
  // `getSubscriptionAppAccountToken` only declares a 200 response, so openapi-fetch types `data`
  // as always present and `response` collapses to `never` on the narrowed error branch — widen
  // before the runtime check so the error branch still type-checks (mirrors `createTrip`).
  const { data, error, response } = (await api.GET('/subscription/app-account-token')) as {
    data?: components['schemas']['AppAccountTokenDto'];
    error?: unknown;
    response: Response;
  };
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data.appAccountToken;
}

export async function syncSubscription(
  api: ApiClient = defaultApi,
): Promise<SubscriptionStatusDto> {
  const { data, error, response } = await api.POST('/subscription/sync');
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

/** Seeds `/subscription/status`'s cache with a freshly-returned DTO — skips the extra refetch. */
export function applyStatus(qc: QueryClient, dto: SubscriptionStatusDto): void {
  qc.setQueryData(keys.subscription.status, dto);
}

export function useValidateAppleTransaction(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jws: string) => validateAppleTransaction(jws, api),
    onSuccess: (data) => applyStatus(queryClient, data),
  });
}

export function useVerifyPlayPurchase(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: VerifyPlayPurchaseDto) => verifyPlayPurchase(body, api),
    onSuccess: (data) => applyStatus(queryClient, data),
  });
}

export function useSyncSubscription(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => syncSubscription(api),
    onSuccess: (data) => applyStatus(queryClient, data),
  });
}
