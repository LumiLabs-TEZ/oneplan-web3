import { storage } from '@/offline/mmkv';

import { pendingInvitesStore, usePendingInvitesStore } from './pendingInvitesStore';
import type { PendingInvite } from './types';

const A: PendingInvite = {
  inviteCode: 'AAA',
  tripName: 'Da Lat',
  coverImageUrl: null,
  invitedByDisplayName: 'Ken',
};
const B: PendingInvite = {
  inviteCode: 'BBB',
  tripName: 'Hanoi',
  coverImageUrl: null,
  invitedByDisplayName: 'Linh',
};

beforeEach(() => {
  pendingInvitesStore.reset();
});

describe('pendingInvitesStore', () => {
  it('starts empty', () => {
    const state = usePendingInvitesStore.getState();
    expect(state.invites).toEqual([]);
    expect(state.queue).toEqual([]);
    expect(state.activeCode).toBeNull();
  });

  it('upsert dedupes by code and preserves queue order', () => {
    pendingInvitesStore.upsert(A, 'websocket');
    pendingInvitesStore.upsert(B, 'api');
    pendingInvitesStore.upsert({ ...A, tripName: 'Da Lat Trip' }, 'websocket');

    const state = usePendingInvitesStore.getState();
    expect(state.invites).toEqual([{ ...A, tripName: 'Da Lat Trip' }, B]);
    // Only the websocket invite queues a popup; B (fetched) is banner-only.
    expect(state.queue).toEqual(['AAA']);
  });

  it('only real-time sources queue a popup — fetched and deep-linked invites are banner-only', () => {
    pendingInvitesStore.upsert(A, 'api');
    pendingInvitesStore.upsert(B, 'deepLink');
    expect(usePendingInvitesStore.getState().queue).toEqual([]);
    expect(usePendingInvitesStore.getState().invites).toEqual([A, B]);

    pendingInvitesStore.upsert({ ...B, inviteCode: 'CCC' }, 'push');
    pendingInvitesStore.upsert(A, 'websocket');
    expect(usePendingInvitesStore.getState().queue).toEqual(['CCC', 'AAA']);
  });

  it('upsert keeps the known inviter and cover when a deep link re-upserts without them', () => {
    const withCover = { ...A, coverImageUrl: 'https://img/cover.jpg' };
    pendingInvitesStore.upsert(withCover, 'api');
    pendingInvitesStore.upsert(
      { ...A, tripName: 'Renamed', coverImageUrl: null, invitedByDisplayName: '' },
      'deepLink',
    );
    const [merged] = usePendingInvitesStore.getState().invites;
    expect(merged).toEqual({ ...withCover, tripName: 'Renamed' });
  });

  it('decline drops the invite and ignores racing api re-adds, but not websocket re-invites', () => {
    pendingInvitesStore.upsert(A, 'api');
    pendingInvitesStore.decline('AAA');
    expect(usePendingInvitesStore.getState().invites).toEqual([]);

    pendingInvitesStore.upsert(A, 'api');
    expect(usePendingInvitesStore.getState().invites).toEqual([]);

    pendingInvitesStore.upsert(A, 'websocket');
    expect(usePendingInvitesStore.getState().invites).toEqual([A]);
  });

  it('declineFailed restores the invite and lifts the api shield', () => {
    pendingInvitesStore.upsert(A, 'api');
    pendingInvitesStore.decline('AAA');
    pendingInvitesStore.declineFailed(A);
    expect(usePendingInvitesStore.getState().invites).toEqual([A]);
  });

  it('upsert does not duplicate an already-queued or active code in the queue', () => {
    pendingInvitesStore.upsert(A, 'websocket');
    pendingInvitesStore.present('AAA');
    pendingInvitesStore.upsert({ ...A, tripName: 'Updated' }, 'websocket');

    // Still queued once (from the first upsert) — presenting it doesn't drop it
    // from the queue, and re-upserting must not add a second entry.
    expect(usePendingInvitesStore.getState().queue).toEqual(['AAA']);
    expect(usePendingInvitesStore.getState().invites).toEqual([{ ...A, tripName: 'Updated' }]);
  });

  it('upsert of the currently presented code never enqueues it (deep-link mount)', () => {
    // The join screen marks the code active *before* upserting itself, so the
    // presenter cannot pop it off the queue and push a duplicate screen.
    pendingInvitesStore.present('AAA');
    pendingInvitesStore.upsert(A, 'deepLink');

    expect(usePendingInvitesStore.getState().queue).toEqual([]);
    expect(usePendingInvitesStore.getState().activeCode).toBe('AAA');
    expect(usePendingInvitesStore.getState().invites).toEqual([A]);
  });

  it('resolve removes the invite and clears active when it matches', () => {
    pendingInvitesStore.upsert(A, 'websocket');
    pendingInvitesStore.upsert(B, 'api');
    pendingInvitesStore.present('AAA');

    pendingInvitesStore.resolve('AAA');

    const state = usePendingInvitesStore.getState();
    expect(state.invites).toEqual([B]);
    expect(state.queue).toEqual([]);
    expect(state.activeCode).toBeNull();
  });

  it('resolve leaves active alone when it does not match', () => {
    pendingInvitesStore.upsert(A, 'websocket');
    pendingInvitesStore.upsert(B, 'api');
    pendingInvitesStore.present('AAA');

    pendingInvitesStore.resolve('BBB');

    expect(usePendingInvitesStore.getState().activeCode).toBe('AAA');
  });

  it('dismissActive keeps the invite in `invites`', () => {
    pendingInvitesStore.upsert(A, 'websocket');
    pendingInvitesStore.present('AAA');

    pendingInvitesStore.dismissActive();

    const state = usePendingInvitesStore.getState();
    expect(state.activeCode).toBeNull();
    expect(state.invites).toEqual([A]);
  });

  it('takeNext pops the queue and presents the next still-pending code', () => {
    pendingInvitesStore.upsert(A, 'websocket');
    pendingInvitesStore.upsert(B, 'websocket');

    expect(pendingInvitesStore.takeNext()).toBe('AAA');
    expect(usePendingInvitesStore.getState().activeCode).toBe('AAA');
    expect(usePendingInvitesStore.getState().queue).toEqual(['BBB']);
  });

  it('takeNext skips codes that were resolved out from under the queue', () => {
    pendingInvitesStore.upsert(A, 'websocket');
    pendingInvitesStore.upsert(B, 'api');
    // Simulate a stale queue entry (e.g. resolved via another device) without
    // going through `resolve`, to exercise takeNext's own skip logic.
    usePendingInvitesStore.setState({ invites: [B], queue: ['AAA', 'BBB'] });

    expect(pendingInvitesStore.takeNext()).toBe('BBB');
    expect(usePendingInvitesStore.getState().queue).toEqual([]);
  });

  it('takeNext returns null and empties the queue when nothing is left pending', () => {
    usePendingInvitesStore.setState({ invites: [], queue: ['AAA'] });

    expect(pendingInvitesStore.takeNext()).toBeNull();
    expect(usePendingInvitesStore.getState().queue).toEqual([]);
    expect(usePendingInvitesStore.getState().activeCode).toBeNull();
  });

  it('persists only `invites` under oneplan.pendingTripInvites', () => {
    pendingInvitesStore.upsert(A, 'websocket');
    pendingInvitesStore.present('AAA');

    const raw = storage.getString('oneplan.pendingTripInvites');
    expect(raw).toBeDefined();
    const persisted = JSON.parse(raw!).state;
    expect(persisted).toEqual({ invites: [A] });
    expect(persisted.queue).toBeUndefined();
    expect(persisted.activeCode).toBeUndefined();
  });

  it('reset clears everything', () => {
    pendingInvitesStore.upsert(A, 'websocket');
    pendingInvitesStore.present('AAA');

    pendingInvitesStore.reset();

    const state = usePendingInvitesStore.getState();
    expect(state.invites).toEqual([]);
    expect(state.queue).toEqual([]);
    expect(state.activeCode).toBeNull();
  });
});
