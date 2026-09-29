import type { TripStatus } from '../types';
import { tripAccess } from './tripAccess';

describe('tripAccess', () => {
  const statuses: TripStatus[] = ['PLANNING', 'ONGOING', 'ENDED'];

  it.each(statuses)('%s online + live data: editable unless ENDED', (status) => {
    const access = tripAccess({ status, online: true, servingCached: false });
    expect(access.isOffline).toBe(false);
    expect(access.canEdit).toBe(status !== 'ENDED');
    expect(access.tabBarEnabled).toBe(status !== 'ENDED');
  });

  it.each(statuses)('%s offline: read-only, tab bar still driven by status', (status) => {
    const access = tripAccess({ status, online: false, servingCached: false });
    expect(access.isOffline).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(access.tabBarEnabled).toBe(status !== 'ENDED');
  });

  it.each(statuses)('%s online but serving cached data: read-only', (status) => {
    const access = tripAccess({ status, online: true, servingCached: true });
    expect(access.isOffline).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(access.tabBarEnabled).toBe(status !== 'ENDED');
  });

  it('cannot edit while the trip is still loading', () => {
    expect(tripAccess({ status: undefined, online: true, servingCached: false }).canEdit).toBe(
      false,
    );
    expect(tripAccess({ status: null, online: true, servingCached: false }).canEdit).toBe(false);
  });
});
