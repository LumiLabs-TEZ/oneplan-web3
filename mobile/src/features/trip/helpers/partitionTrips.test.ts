import type { TripStatus, TripSummaryDto } from '../types';
import { partitionTrips } from './partitionTrips';

function trip(id: number, status: TripStatus): TripSummaryDto {
  return { id, name: `Trip ${id}`, status, memberCount: 1, currency: 'USD' };
}

describe('partitionTrips', () => {
  it('returns empty buckets for no trips', () => {
    expect(partitionTrips([])).toEqual({ ongoing: null, planning: [], ended: [] });
  });

  it('has no ongoing trip when none is ONGOING', () => {
    const result = partitionTrips([trip(1, 'PLANNING'), trip(2, 'ENDED')]);
    expect(result.ongoing).toBeNull();
    expect(result.planning.map((t) => t.id)).toEqual([1]);
    expect(result.ended.map((t) => t.id)).toEqual([2]);
  });

  it('picks the single ONGOING trip', () => {
    const result = partitionTrips([trip(1, 'PLANNING'), trip(2, 'ONGOING')]);
    expect(result.ongoing?.id).toBe(2);
  });

  it('first ONGOING in server order wins when there are many', () => {
    const result = partitionTrips([trip(5, 'ENDED'), trip(3, 'ONGOING'), trip(1, 'ONGOING')]);
    expect(result.ongoing?.id).toBe(3);
    expect(result.planning).toEqual([]);
    expect(result.ended.map((t) => t.id)).toEqual([5]);
  });

  it('preserves server order inside planning and ended buckets', () => {
    const result = partitionTrips([
      trip(9, 'ENDED'),
      trip(4, 'PLANNING'),
      trip(2, 'ENDED'),
      trip(7, 'PLANNING'),
      trip(1, 'PLANNING'),
    ]);
    expect(result.planning.map((t) => t.id)).toEqual([4, 7, 1]);
    expect(result.ended.map((t) => t.id)).toEqual([9, 2]);
  });
});
