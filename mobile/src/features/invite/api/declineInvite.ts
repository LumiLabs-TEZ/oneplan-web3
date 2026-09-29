/**
 * Declines a pending trip invite on the server so it stops coming back from
 * `GET /trips/invites/pending`. The pending-invite DTO only carries the invite code, so the
 * trip id comes from the invite preview, then `PATCH /trips/{id}/members/respond` records
 * `DECLINED`. iOS only drops the invite locally (`RealtimeService.resolveTripInvite`), which is
 * why it reappeared after a relaunch.
 */
import { useMutation } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';

import { fetchInvitePreview } from './queries';

export async function declineInvite(
  inviteCode: string,
  api: ApiClient = defaultApi,
): Promise<void> {
  const preview = await fetchInvitePreview(inviteCode, api);
  // Already a member (accepted elsewhere): nothing left to decline.
  if (preview.isMember) return;
  const { error, response } = await api.PATCH('/trips/{id}/members/respond', {
    params: { path: { id: preview.tripId } },
    body: { status: 'DECLINED' },
  });
  // 404 = no membership row (a deep-link-only invite); 400 = already responded. Either way the
  // invite is gone from the pending list, which is all the banner needs.
  if (response.status === 404 || response.status === 400) return;
  if (error || !response.ok) throw new ApiMutationError(response.status, error);
}

export function useDeclineInvite(api: ApiClient = defaultApi) {
  return useMutation({ mutationFn: (inviteCode: string) => declineInvite(inviteCode, api) });
}
