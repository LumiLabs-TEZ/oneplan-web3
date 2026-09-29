/**
 * Trip photos — cursor-paginated (`GET /trips/{tripId}/photos`), backs the (Phase 2+) photo
 * grid. `usePhotos` pages 20 at a time for an infinite scroll grid; `fetchAllPhotos` drains
 * every page (50 at a time) for one-shot consumers (e.g. export/share flows).
 */
import { useInfiniteQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { HttpError } from '@/features/trip/api/queries';

import type { TripPhotoDto } from '../types';

export type { TripPhotoDto };
export type TripPhotoListDto = { data: TripPhotoDto[]; nextCursor?: number | null };

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function unwrap<T>(label: string, result: FetchResult<T>): T {
  const { data, error, response } = result;
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(label, response.status, error ?? null);
  }
  return data;
}

export async function fetchPhotosPage(
  tripId: number,
  cursor: number | null,
  take: number,
  api: ApiClient = defaultApi,
): Promise<TripPhotoListDto> {
  return unwrap(
    `GET /trips/${tripId}/photos`,
    await api.GET('/trips/{tripId}/photos', {
      params: {
        path: { tripId },
        query: cursor === null ? { take } : { cursor, take },
      },
    }),
  );
}

/** 20-per-page infinite query for the photo grid. */
export function usePhotos(tripId: number) {
  return useInfiniteQuery({
    queryKey: keys.trips.photos(tripId),
    queryFn: ({ pageParam }) => fetchPhotosPage(tripId, pageParam, 20),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    meta: { persist: false },
  });
}

/** Drains every page (50 at a time) into a flat list — for consumers that need the full set. */
export async function fetchAllPhotos(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<TripPhotoDto[]> {
  const all: TripPhotoDto[] = [];
  let cursor: number | null = null;
  for (;;) {
    const page = await fetchPhotosPage(tripId, cursor, 50, api);
    all.push(...page.data);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return all;
}
