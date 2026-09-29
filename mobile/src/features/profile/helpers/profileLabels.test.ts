import type { FriendDto, FriendRequestDto } from '@/features/friends/types';

import {
  LOCKED_FRIEND_CODE_LABEL,
  friendsToRows,
  requestsToRows,
  resolveDisplayName,
} from './profileLabels';

const t = ((key: string, opts?: { count?: number }) =>
  opts?.count !== undefined ? `${opts.count} mutual friends` : key) as never;

describe('LOCKED_FRIEND_CODE_LABEL', () => {
  it('is the locked mock code', () => {
    expect(LOCKED_FRIEND_CODE_LABEL).toBe('OP-2006-2710');
  });
});

describe('resolveDisplayName', () => {
  it('returns the display name when present', () => {
    expect(resolveDisplayName('Ken', 'One Plan User')).toBe('Ken');
  });

  it('falls back on null', () => {
    expect(resolveDisplayName(null, 'One Plan User')).toBe('One Plan User');
  });

  it('falls back on undefined', () => {
    expect(resolveDisplayName(undefined, 'One Plan User')).toBe('One Plan User');
  });

  it('falls back on a blank string', () => {
    expect(resolveDisplayName('   ', 'One Plan User')).toBe('One Plan User');
  });
});

describe('friendsToRows', () => {
  it('maps FriendDto rows keyed by friendshipId', () => {
    const friends: FriendDto[] = [
      {
        friendshipId: 7,
        user: { id: 1, displayName: 'Alice', avatarUrl: 'https://x/a.jpg', isPro: true },
        mutualFriendCount: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(friendsToRows(friends, t)).toEqual([
      {
        id: '7',
        name: 'Alice',
        subtitle: '3 mutual friends',
        avatarUrl: 'https://x/a.jpg',
        isPro: true,
      },
    ]);
  });
});

describe('requestsToRows', () => {
  it('maps FriendRequestDto rows with a request- prefixed id', () => {
    const requests: FriendRequestDto[] = [
      {
        id: 9,
        sender: {
          id: 2,
          displayName: 'Bob',
          avatarUrl: null,
          isPro: false,
          memberSince: '2025-01-01T00:00:00.000Z',
        },
        mutualFriendCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(requestsToRows(requests, t)).toEqual([
      { id: 'request-9', name: 'Bob', subtitle: '0 mutual friends', avatarUrl: null, isPro: false },
    ]);
  });
});
