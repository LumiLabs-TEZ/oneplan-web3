import { renderHook, waitFor } from '@testing-library/react-native';

import type { TripPhotoDto } from '@/features/trip/types';

import {
  flattenPhotoPages,
  MAX_CONSECUTIVE_DRAIN_FAILURES,
  type PhotoPage,
  useAllTripPhotos,
} from './useAllTripPhotos';

function photo(id: number): TripPhotoDto {
  return { id } as TripPhotoDto;
}

/** Stands in for the `usePhotos` infinite query. `fetchNextPage` mutates it like TanStack would. */
const mockQuery: {
  data: { pages: PhotoPage[] };
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  fetchNextPage: jest.Mock;
} = {
  data: { pages: [] },
  hasNextPage: false,
  isFetchingNextPage: false,
  isError: false,
  fetchNextPage: jest.fn(),
};

jest.mock('@/features/trip/api/photos', () => ({
  usePhotos: () => mockQuery,
}));

/**
 * Fake server: an album of `totalPages` pages, where the next `failures` fetches fail. A failed
 * fetch resolves with the *unchanged* page set — exactly what TanStack does, which is why
 * `hasNextPage` stays true and the drain would otherwise loop.
 */
function serveAlbum({ totalPages, failures = 0 }: { totalPages: number; failures?: number }) {
  let remainingFailures = failures;
  mockQuery.data = { pages: [{ data: [photo(1)], nextCursor: 1 }] };
  mockQuery.hasNextPage = totalPages > 1;
  mockQuery.isFetchingNextPage = false;
  mockQuery.isError = false;
  mockQuery.fetchNextPage.mockReset();
  mockQuery.fetchNextPage.mockImplementation(async () => {
    if (remainingFailures > 0) {
      remainingFailures -= 1;
      return { data: mockQuery.data };
    }
    const next = mockQuery.data.pages.length + 1;
    mockQuery.data = {
      pages: [...mockQuery.data.pages, { data: [photo(next)], nextCursor: next }],
    };
    mockQuery.hasNextPage = mockQuery.data.pages.length < totalPages;
    return { data: mockQuery.data };
  });
}

describe('flattenPhotoPages', () => {
  it('returns an empty list when there are no pages yet', () => {
    expect(flattenPhotoPages(undefined)).toEqual([]);
    expect(flattenPhotoPages([])).toEqual([]);
  });

  it('concatenates every page in order (so the count is the whole album, not one page)', () => {
    const pages: PhotoPage[] = [
      { data: [photo(1), photo(2)], nextCursor: 2 },
      { data: [photo(3)], nextCursor: 3 },
      { data: [photo(4)], nextCursor: null },
    ];
    expect(flattenPhotoPages(pages).map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(flattenPhotoPages(pages)).toHaveLength(4);
  });

  it('tolerates an empty trailing page', () => {
    expect(flattenPhotoPages([{ data: [photo(1)] }, { data: [] }])).toHaveLength(1);
  });
});

describe('useAllTripPhotos', () => {
  it('does not fetch when the album fits in one page', async () => {
    serveAlbum({ totalPages: 1 });
    const { result } = await renderHook(() => useAllTripPhotos(1));

    expect(mockQuery.fetchNextPage).not.toHaveBeenCalled();
    expect(result.current.draining).toBe(false);
    expect(result.current.photos).toHaveLength(1);
  });

  // The budget must be spent by FAILURES only — counting every attempt truncated healthy albums
  // bigger than `1 + MAX × pageSize`.
  it('drains a healthy 6-page album in full', async () => {
    serveAlbum({ totalPages: 6 });
    const { result } = await renderHook(() => useAllTripPhotos(1));

    await waitFor(() => expect(result.current.draining).toBe(false));

    expect(mockQuery.fetchNextPage).toHaveBeenCalledTimes(5);
    expect(mockQuery.hasNextPage).toBe(false);
    expect(result.current.photos.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('drains an album far larger than the failure budget', async () => {
    serveAlbum({ totalPages: 10 });
    const { result } = await renderHook(() => useAllTripPhotos(1));

    await waitFor(() => expect(result.current.draining).toBe(false));

    expect(mockQuery.fetchNextPage).toHaveBeenCalledTimes(9);
    expect(result.current.photos).toHaveLength(10);
  });

  it('stops after consecutive failures, keeping the partial list', async () => {
    serveAlbum({ totalPages: 6, failures: Number.POSITIVE_INFINITY });
    const { result } = await renderHook(() => useAllTripPhotos(1));

    await waitFor(() => expect(result.current.draining).toBe(false));

    expect(mockQuery.fetchNextPage).toHaveBeenCalledTimes(MAX_CONSECUTIVE_DRAIN_FAILURES);
    expect(mockQuery.hasNextPage).toBe(true); // the loop condition of the original bug
    expect(result.current.photos).toHaveLength(1);
  });

  it('resets the budget when a page succeeds after a failure', async () => {
    // Two failures, then the album pages in normally — the drain must still finish.
    serveAlbum({ totalPages: 5, failures: 2 });
    const { result } = await renderHook(() => useAllTripPhotos(1));

    await waitFor(() => expect(result.current.draining).toBe(false));

    // 2 wasted + 4 productive: the budget was reset by the first success, so it never ran out.
    expect(mockQuery.fetchNextPage).toHaveBeenCalledTimes(6);
    expect(result.current.photos).toHaveLength(5);
  });

  it('stops draining when the whole query errors', async () => {
    serveAlbum({ totalPages: 6 });
    mockQuery.isError = true;
    const { result } = await renderHook(() => useAllTripPhotos(1));

    expect(mockQuery.fetchNextPage).not.toHaveBeenCalled();
    expect(result.current.draining).toBe(false);
  });

  it('starts a fresh budget for a different trip', async () => {
    serveAlbum({ totalPages: 6, failures: Number.POSITIVE_INFINITY });
    const { result, rerender } = await renderHook(
      ({ id }: { id: number }) => useAllTripPhotos(id),
      { initialProps: { id: 1 } },
    );
    await waitFor(() => expect(result.current.draining).toBe(false));
    const afterFirstTrip = mockQuery.fetchNextPage.mock.calls.length;
    expect(afterFirstTrip).toBe(MAX_CONSECUTIVE_DRAIN_FAILURES);

    await rerender({ id: 2 });
    await waitFor(() =>
      expect(mockQuery.fetchNextPage.mock.calls.length).toBeGreaterThan(afterFirstTrip),
    );
  });
});
