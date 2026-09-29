import type { FriendDto, FriendRequestDto } from '../types';
import { flattenFriendsRows } from './friendsRows';

const request = (id: number) => ({ id }) as FriendRequestDto;
const friend = (friendshipId: number) => ({ friendshipId }) as FriendDto;

it('puts the labelled requests card above the friends card', () => {
  const rows = flattenFriendsRows([request(1), request(2)], [friend(7), friend(8), friend(9)]);
  expect(rows.map((row) => row.key)).toEqual([
    'request-label',
    'request:1',
    'request:2',
    'friend:7',
    'friend:8',
    'friend:9',
  ]);
  expect(rows.map((row) => ('isFirst' in row ? [row.isFirst, row.isLast] : null))).toEqual([
    null,
    [true, false],
    [false, true],
    [true, false],
    [false, false],
    [false, true],
  ]);
  expect(rows.map((row) => ('spaced' in row ? row.spaced : null))).toEqual([
    null,
    null,
    null,
    true,
    false,
    false,
  ]);
});

it('rounds both edges of a single-row card', () => {
  const rows = flattenFriendsRows([], [friend(3)]);
  expect(rows).toEqual([
    {
      type: 'friend',
      key: 'friend:3',
      friend: friend(3),
      isFirst: true,
      isLast: true,
      spaced: false,
    },
  ]);
});

it('shows the empty state when there are no friends', () => {
  expect(flattenFriendsRows([], [])).toEqual([{ type: 'empty', key: 'empty', spaced: false }]);
  expect(flattenFriendsRows([request(4)], []).at(-1)).toEqual({
    type: 'empty',
    key: 'empty',
    spaced: true,
  });
});
