import type { FriendDto } from '@/features/friends/types';

import { memberEntries } from './memberEntries';
import type { TripMemberDto } from '../types';

function member(overrides: Partial<TripMemberDto> & { userId: number }): TripMemberDto {
  return {
    id: overrides.userId,
    displayName: `User ${overrides.userId}`,
    avatarUrl: null,
    inviteStatus: 'ACCEPTED',
    role: 'MEMBER',
    isPro: false,
    ...overrides,
  };
}

function friend(
  overrides: Partial<FriendDto> & { userId: number; mutualFriendCount?: number },
): FriendDto {
  const { userId, mutualFriendCount = 0, ...rest } = overrides;
  return {
    friendshipId: userId,
    mutualFriendCount,
    createdAt: '2026-01-01T00:00:00.000Z',
    user: { id: userId, displayName: `User ${userId}`, avatarUrl: null, isPro: false },
    ...rest,
  };
}

const opts = (extra: Partial<Parameters<typeof memberEntries>[1]> = {}) => ({
  currentUserId: 1,
  friends: [] as FriendDto[],
  currentUserIsPro: false,
  ...extra,
});

describe('memberEntries', () => {
  it('flags the current user as self', () => {
    const members = [member({ userId: 1 }), member({ userId: 2 })];

    const entries = memberEntries(members, opts());

    expect(entries.find((e) => e.userId === 1)?.isSelf).toBe(true);
    expect(entries.find((e) => e.userId === 2)?.isSelf).toBe(false);
  });

  it('orders ACCEPTED members before PENDING members, preserving relative order within each group', () => {
    const members = [
      member({ userId: 1, inviteStatus: 'PENDING' }),
      member({ userId: 2, inviteStatus: 'ACCEPTED' }),
      member({ userId: 3, inviteStatus: 'PENDING' }),
      member({ userId: 4, inviteStatus: 'ACCEPTED' }),
    ];

    const entries = memberEntries(members, opts({ currentUserId: 2 }));

    expect(entries.map((e) => e.userId)).toEqual([2, 4, 1, 3]);
    expect(entries.find((e) => e.userId === 1)?.inviteStatus).toBe('PENDING');
  });

  it('carries through display name, avatar, and pro flag (from the member when not a friend)', () => {
    const members = [
      member({
        userId: 5,
        displayName: 'Cattie',
        avatarUrl: 'https://example.com/a.png',
        isPro: true,
      }),
    ];

    const [entry] = memberEntries(members, opts({ currentUserId: 999 }));

    expect(entry).toMatchObject({
      userId: 5,
      displayName: 'Cattie',
      avatarUrl: 'https://example.com/a.png',
      isPro: true,
    });
  });

  it('self is always a friend with friendAction null and isPro from currentUserIsPro', () => {
    const members = [member({ userId: 1, isPro: false })];

    const entries = memberEntries(members, opts({ currentUserId: 1, currentUserIsPro: true }));

    expect(entries[0]).toMatchObject({
      isSelf: true,
      isFriend: true,
      friendAction: null,
      isPro: true,
    });
  });

  it('non-self, non-friend member gets friendAction "add" and 0 mutual friends', () => {
    const members = [member({ userId: 2 })];

    const entries = memberEntries(members, opts({ currentUserId: 1 }));

    expect(entries[0]).toMatchObject({
      isFriend: false,
      friendAction: 'add',
      mutualFriendCount: 0,
    });
  });

  it('non-self member already in the friends list gets friendAction "friend", mutual count, and pro from the friend record', () => {
    const members = [member({ userId: 2, isPro: false })];
    const friends = [
      friend({
        userId: 2,
        mutualFriendCount: 4,
        user: { id: 2, displayName: 'X', avatarUrl: null, isPro: true },
      }),
    ];

    const entries = memberEntries(members, opts({ currentUserId: 1, friends }));

    expect(entries[0]).toMatchObject({
      isFriend: true,
      friendAction: 'friend',
      mutualFriendCount: 4,
      isPro: true,
    });
  });

  it('carries through the member role', () => {
    const members = [member({ userId: 2, role: 'CO_HOST' }), member({ userId: 3, role: 'HOST' })];

    const entries = memberEntries(members, opts({ currentUserId: 1 }));

    expect(entries.find((e) => e.userId === 2)?.role).toBe('CO_HOST');
    expect(entries.find((e) => e.userId === 3)?.role).toBe('HOST');
  });

  it('carries through the member friendCode, defaulting to null', () => {
    const members = [member({ userId: 2, friendCode: 'abc' }), member({ userId: 3 })];

    const entries = memberEntries(members, opts({ currentUserId: 1 }));

    expect(entries.find((e) => e.userId === 2)?.friendCode).toBe('abc');
    expect(entries.find((e) => e.userId === 3)?.friendCode).toBeNull();
  });
});
