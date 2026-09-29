import { useMissionsTransport } from './transport';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';

export type Overview = components['schemas']['MissionsOverviewDto'];
export type Reward = components['schemas']['ShopItemStateDto'];
export type Redemption = components['schemas']['RedeemResultDto'];
export type RedeemInput = components['schemas']['RedeemRewardDto'];
export type MissionEvent = components['schemas']['ReportMissionEventDto'];
function result<T>(value: { data?: T; error?: unknown; response: Response }): T {
  if (!value.response.ok || value.data === undefined)
    throw new ApiMutationError(value.response.status, value.error);
  return value.data;
}
export async function fetchMissions(
  client: ApiClient = api,
  signal?: AbortSignal,
): Promise<Overview> {
  return result(await client.GET('/missions', { signal }));
}
export async function reportMissionEvent(body: MissionEvent, client: ApiClient = api) {
  return result(await client.POST('/missions/events', { body }));
}
export async function redeemReward(
  body: RedeemInput,
  client: ApiClient = api,
  signal?: AbortSignal,
): Promise<Redemption> {
  return result(await client.POST('/missions/redeem', { body, signal }));
}
export function useMissions() {
  const transport = useMissionsTransport();
  return useQuery({ queryKey: keys.missions, queryFn: () => fetchMissions(transport) });
}
