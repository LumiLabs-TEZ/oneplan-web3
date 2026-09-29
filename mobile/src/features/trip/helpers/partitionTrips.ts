import type { TripSummaryDto } from '../types';

export interface PartitionedTrips {
  /** First `ONGOING` trip in server order (the Home card); `null` when none. */
  ongoing: TripSummaryDto | null;
  planning: TripSummaryDto[];
  ended: TripSummaryDto[];
}

/**
 * Split one `GET /trips` response by status (iOS `TripService.listMyTrips`
 * filters the same array three times). Server order is preserved; the first
 * `ONGOING` entry wins as *the* ongoing trip. Extra ongoing trips are dropped
 * here on purpose — Home only ever shows one.
 */
export function partitionTrips(summaries: readonly TripSummaryDto[]): PartitionedTrips {
  let ongoing: TripSummaryDto | null = null;
  const planning: TripSummaryDto[] = [];
  const ended: TripSummaryDto[] = [];

  for (const trip of summaries) {
    switch (trip.status) {
      case 'ONGOING':
        if (ongoing === null) ongoing = trip;
        break;
      case 'PLANNING':
        planning.push(trip);
        break;
      case 'ENDED':
        ended.push(trip);
        break;
    }
  }

  return { ongoing, planning, ended };
}
