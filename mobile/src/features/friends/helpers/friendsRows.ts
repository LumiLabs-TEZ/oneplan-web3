import type { FriendDto, FriendRequestDto } from '../types';

/**
 * One row of the profile friends list. Each card (pending requests, friends) is split into one
 * row per person; `isFirst`/`isLast` round the card's top/bottom edges, the way trip history
 * rows do. `spaced` marks the first row of the friends block when a requests block sits above it.
 */
export type FriendsRow =
  | { type: 'requestLabel'; key: string }
  | { type: 'request'; key: string; request: FriendRequestDto; isFirst: boolean; isLast: boolean }
  | {
      type: 'friend';
      key: string;
      friend: FriendDto;
      isFirst: boolean;
      isLast: boolean;
      spaced: boolean;
    }
  | { type: 'empty'; key: string; spaced: boolean };

/** Pending requests (with their label) above the friends, or the empty state when no friends. */
export function flattenFriendsRows(
  requests: readonly FriendRequestDto[],
  friends: readonly FriendDto[],
): FriendsRow[] {
  const rows: FriendsRow[] = [];
  const spaced = requests.length > 0;
  if (spaced) {
    rows.push({ type: 'requestLabel', key: 'request-label' });
    requests.forEach((request, index) =>
      rows.push({
        type: 'request',
        key: `request:${request.id}`,
        request,
        isFirst: index === 0,
        isLast: index === requests.length - 1,
      }),
    );
  }
  if (friends.length === 0) {
    rows.push({ type: 'empty', key: 'empty', spaced });
    return rows;
  }
  friends.forEach((friend, index) =>
    rows.push({
      type: 'friend',
      key: `friend:${friend.friendshipId}`,
      friend,
      isFirst: index === 0,
      isLast: index === friends.length - 1,
      spaced: spaced && index === 0,
    }),
  );
  return rows;
}
