/**
 * Trip notes create/update/delete — mirrors iOS `NoteService` optimistic list updates:
 * create inserts at index 0, update writes the returned row back in place, delete removes
 * immediately (with rollback on error). Every mutation still invalidates the notes query so a
 * background refetch reconciles with the server.
 */
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import type { CreateTripNoteDto, TripNoteDto, UpdateTripNoteDto } from '../types';

export async function createTripNote(
  tripId: number,
  body: CreateTripNoteDto,
  api: ApiClient = defaultApi,
): Promise<TripNoteDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/notes', {
    params: { path: { tripId } },
    body,
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function updateTripNote(
  tripId: number,
  id: number,
  body: UpdateTripNoteDto,
  api: ApiClient = defaultApi,
): Promise<TripNoteDto> {
  const { data, error, response } = await api.PATCH('/trips/{tripId}/notes/{id}', {
    params: { path: { tripId, id } },
    body,
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function deleteTripNote(
  tripId: number,
  id: number,
  api: ApiClient = defaultApi,
): Promise<void> {
  const { error, response } = await api.DELETE('/trips/{tripId}/notes/{id}', {
    params: { path: { tripId, id } },
  });
  if (error || !response.ok) throw new ApiMutationError(response.status, error);
}

function invalidateNotes(queryClient: QueryClient, tripId: number): Promise<unknown> {
  return queryClient.invalidateQueries({ queryKey: keys.trips.notes(tripId) });
}

/** Inserts the created note at index 0, matching iOS's newest-first ordering. */
export function useCreateNote(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTripNoteDto) => createTripNote(tripId, body, api),
    onSuccess: (note) => {
      queryClient.setQueryData<TripNoteDto[]>(keys.trips.notes(tripId), (prev) => [
        note,
        ...(prev ?? []),
      ]);
      return invalidateNotes(queryClient, tripId);
    },
  });
}

/** Writes the returned row back in place, preserving list position. */
export function useUpdateNote(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateTripNoteDto }) =>
      updateTripNote(tripId, id, body, api),
    onSuccess: (note) => {
      queryClient.setQueryData<TripNoteDto[]>(keys.trips.notes(tripId), (prev) =>
        prev ? prev.map((n) => (n.id === note.id ? note : n)) : prev,
      );
      return invalidateNotes(queryClient, tripId);
    },
  });
}

/** Optimistically removes the note; restores the prior list on error. */
export function useDeleteNote(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTripNote(tripId, id, api),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: keys.trips.notes(tripId) });
      const previous = queryClient.getQueryData<TripNoteDto[]>(keys.trips.notes(tripId));
      queryClient.setQueryData<TripNoteDto[]>(keys.trips.notes(tripId), (prev) =>
        prev ? prev.filter((n) => n.id !== id) : prev,
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.trips.notes(tripId), context.previous);
      }
    },
    onSettled: () => invalidateNotes(queryClient, tripId),
  });
}
