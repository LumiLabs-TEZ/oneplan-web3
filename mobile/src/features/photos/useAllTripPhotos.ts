/**
 * Drains `usePhotos` so a consumer that needs the *whole* album (the trip-end shared-album card:
 * "N photos uploaded by all members." and `Download all`'s initial total) never reports the first
 * page's 20 as the total. The recap is a terminal screen and the album is small, so paging it all
 * in is cheaper than the wrong number.
 *
 * Draining must terminate without truncating:
 *
 * - A naive `if (hasNextPage && !isFetchingNextPage) fetchNextPage()` loops forever when a later
 *   page fails — `hasNextPage` is derived from the last *successful* page so it stays true, while
 *   `isFetchingNextPage` flips back to false and re-arms the effect.
 * - A budget that counts *every* attempt truncates healthy albums: a 10-page trip would stop with
 *   pages still unread once the cap was hit.
 *
 * So the budget is spent only by attempts that make no progress (a rejected page, or one that did
 * not grow `data.pages`), and is reset the moment the page count grows. A healthy album of any
 * size drains fully; `MAX_CONSECUTIVE_DRAIN_FAILURES` failures in a row give up, keeping whatever
 * pages did load.
 */
import { useEffect, useRef, useState } from 'react';

import { usePhotos } from '@/features/trip/api/photos';
import type { TripPhotoDto } from '@/features/trip/types';

export interface PhotoPage {
  data: TripPhotoDto[];
  nextCursor?: number | null;
}

/** Flattens the infinite-query pages in order; `undefined` pages → `[]`. */
export function flattenPhotoPages(pages: readonly PhotoPage[] | undefined): TripPhotoDto[] {
  return (pages ?? []).flatMap((page) => page.data);
}

/** Consecutive non-progressing attempts tolerated before the drain gives up. */
export const MAX_CONSECUTIVE_DRAIN_FAILURES = 3;

/** Failures are scoped to a trip, so switching trips starts with a fresh budget. */
interface DrainProgress {
  tripId: number;
  failures: number;
}

export interface AllTripPhotos {
  photos: TripPhotoDto[];
  /** True only while more pages are still genuinely coming — false once drained or given up. */
  draining: boolean;
}

function failuresFor(progress: DrainProgress, tripId: number): number {
  return progress.tripId === tripId ? progress.failures : 0;
}

/** `fetchNextPage()` resolves with the query result (it does not reject on a page error). */
function pageCountOf(result: unknown): number {
  const pages = (result as { data?: { pages?: unknown[] } } | undefined)?.data?.pages;
  return Array.isArray(pages) ? pages.length : 0;
}

export function useAllTripPhotos(tripId: number): AllTripPhotos {
  const query = usePhotos(tripId);
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;
  const pageCount = query.data?.pages.length ?? 0;

  // Exactly one outstanding fetch at a time. `isFetchingNextPage` covers this in production, but
  // it is only observable on the *next* render — a re-armed effect (or React's double-invoke of
  // mount effects) could otherwise fire again first and burn budget on a phantom failure.
  const inFlight = useRef(false);
  const [progress, setProgress] = useState<DrainProgress>({ tripId, failures: 0 });
  const failures = failuresFor(progress, tripId);
  const exhausted = failures >= MAX_CONSECUTIVE_DRAIN_FAILURES;

  useEffect(() => {
    // `isError` = the whole query failed, so there is no "next page" to chase at all.
    if (inFlight.current || !hasNextPage || isFetchingNextPage || isError || exhausted) return;

    // Compared against the page count *at the time of the attempt*, so "did this make progress?"
    // is answered without keeping a second, easily-stale copy of the page count in state.
    const pagesBefore = pageCount;
    inFlight.current = true;
    // `setProgress` runs once the fetch settles — never synchronously in the effect body — so a
    // failed page costs exactly one unit of budget instead of re-arming the effect forever.
    void Promise.resolve(fetchNextPage())
      .then(pageCountOf, () => 0)
      .then((pagesAfter) => {
        inFlight.current = false;
        setProgress((prev) =>
          pagesAfter > pagesBefore
            ? { tripId, failures: 0 }
            : { tripId, failures: failuresFor(prev, tripId) + 1 },
        );
      });
    // `pageCount` and `failures` are both deps on purpose: every settled attempt moves one of
    // them, and that is what re-arms this effect for the next page. Relying on TanStack's
    // intermediate `isFetchingNextPage` render instead would stall the drain after one page.
  }, [
    hasNextPage,
    isFetchingNextPage,
    isError,
    exhausted,
    pageCount,
    failures,
    fetchNextPage,
    tripId,
  ]);

  return {
    photos: flattenPhotoPages(query.data?.pages),
    draining: Boolean(hasNextPage) && !isError && !exhausted,
  };
}
