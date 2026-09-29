/**
 * Leave-trip preview — `GET /trips/{id}/leave-preview` (`getLeavePreview`), the read-only
 * counterpart to `useRemoveMember` in `mutations.ts`. Shows the budget refunds/cancellations and
 * expense share the member would settle if they left right now.
 */
import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';

import { HttpError } from './queries';

type LeavePreviewDto = components['schemas']['LeavePreviewDto'];

export async function fetchLeavePreview(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<LeavePreviewDto> {
  const { data, error, response } = await api.GET('/trips/{id}/leave-preview', {
    params: { path: { id: tripId } },
  });
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(`GET /trips/${tripId}/leave-preview`, response.status, error ?? null);
  }
  return data;
}

/**
 * Fetches the leave preview only while `enabled` — the sheet requests it on `present()`, not on
 * mount, so opening the trip menu never fires this call.
 */
export function useLeavePreview(
  tripId: number,
  opts: { enabled?: boolean } = {},
  api: ApiClient = defaultApi,
) {
  return useQuery({
    queryKey: keys.trips.leavePreview(tripId),
    queryFn: () => fetchLeavePreview(tripId, api),
    enabled: opts.enabled ?? false,
    meta: { persist: false },
  });
}
