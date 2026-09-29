import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';
import { DEEP_LINK_CODE } from '@/links/parseUrl';

import type { PendingInvite } from '../types';

export type InvitePreviewDto = components['schemas']['InvitePreviewDto'];

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

/** `GET /trips/invites/pending` — invites the signed-in user hasn't accepted/declined yet. */
export async function fetchPendingInvites(api: ApiClient = defaultApi): Promise<PendingInvite[]> {
  const dtos = unwrap('GET /trips/invites/pending', await api.GET('/trips/invites/pending'));
  return dtos.map((dto) => ({ ...dto, coverImageUrl: dto.coverImageUrl ?? null }));
}

/**
 * `GET /trips/join/{inviteCode}/preview` — trip name/cover/member count behind an
 * invite code, used by the drag-to-join screen before the user commits
 * (`TripInvitationView.loadInvitePreview`).
 */
export async function fetchInvitePreview(
  inviteCode: string,
  api: ApiClient = defaultApi,
): Promise<InvitePreviewDto> {
  return unwrap(
    `GET /trips/join/${inviteCode}/preview`,
    await api.GET('/trips/join/{inviteCode}/preview', {
      params: { path: { inviteCode } },
    }),
  );
}

/**
 * Disabled for codes that fail the deep-link charset check — a crafted link must
 * never reach the API. Failure is non-fatal: the screen keeps its fallback copy.
 */
export function useInvitePreview(inviteCode: string | undefined) {
  const code = inviteCode ?? '';
  return useQuery({
    queryKey: keys.trips.invitePreview(code),
    queryFn: () => fetchInvitePreview(code),
    enabled: DEEP_LINK_CODE.test(code),
    staleTime: 30_000,
  });
}
