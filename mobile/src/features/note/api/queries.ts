/**
 * Trip notes list — mirrors iOS `NoteService.fetchNotes`. The Note tab lazy-loads on first
 * selection and skips refetching while already-loaded data is fresh (`enabled` gate + 30s
 * staleTime), matching iOS's early-return-unless-empty-or-forced behavior.
 */
import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { HttpError } from '@/features/trip/api/queries';

import type { TripNoteDto, TripNoteListDto } from '../types';

export async function fetchTripNotes(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<TripNoteDto[]> {
  const { data, error, response } = await api.GET('/trips/{tripId}/notes', {
    params: { path: { tripId } },
  });
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(`GET /trips/${tripId}/notes`, response.status, error ?? null);
  }
  return (data as TripNoteListDto).data;
}

export function useTripNotes(
  tripId: number | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const isValidTripId = typeof tripId === 'number' && Number.isFinite(tripId) && tripId > 0;
  const queryEnabled = isValidTripId && enabled;
  return useQuery({
    queryKey: keys.trips.notes(queryEnabled ? tripId : 0),
    queryFn: () => fetchTripNotes(tripId as number),
    enabled: queryEnabled,
    staleTime: 30_000,
    meta: { persist: false },
  });
}
