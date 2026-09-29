import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';
import { HttpError } from '@/features/trip/api/queries';

export type Web3EligibilityDto = components['schemas']['Web3EligibilityDto'];

export async function fetchWeb3Eligibility(
  api: ApiClient = defaultApi,
): Promise<Web3EligibilityDto> {
  const { data, error, response } = await api.GET('/web3/eligibility');
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError('GET /web3/eligibility', response.status, error ?? null);
  }
  return data;
}

/**
 * The server decides (request IP + web3 config); the client only asks. Not persisted — a stale
 * "eligible" from another network must never survive a relaunch. While loading or on error the
 * data is `undefined`, which every consumer treats as "web3 off" (fail closed).
 */
export function useWeb3Eligibility(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.web3Eligibility,
    queryFn: () => fetchWeb3Eligibility(),
    meta: { persist: false },
    staleTime: 5 * 60_000,
    enabled: opts.enabled ?? true,
  });
}
