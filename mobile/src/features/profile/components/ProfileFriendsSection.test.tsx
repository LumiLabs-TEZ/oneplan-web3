import { fireEvent, render, screen } from '@testing-library/react-native';

import type { FriendDto, FriendRequestDto } from '@/features/friends/types';

import { ProfileFriendsSection } from './ProfileFriendsSection';

const friend: FriendDto = {
  friendshipId: 1,
  user: { id: 2, displayName: 'Alice', avatarUrl: null, isPro: false },
  mutualFriendCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const request: FriendRequestDto = {
  id: 5,
  sender: {
    id: 3,
    displayName: 'Bob',
    avatarUrl: null,
    isPro: false,
    memberSince: '2025-01-01T00:00:00.000Z',
  },
  mutualFriendCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ProfileFriendsSection', () => {
  it('shows the empty state when there are no friends and no requests', async () => {
    await render(
      <ProfileFriendsSection requests={[]} friends={[]} onOpenList={jest.fn()} testID="section" />,
    );
    expect(screen.getByText('No friends yet')).toBeTruthy();
    expect(screen.queryByText('Friend requests')).toBeNull();
  });

  it('shows the request count badge and rows when there are pending requests', async () => {
    await render(
      <ProfileFriendsSection
        requests={[request]}
        friends={[]}
        onOpenList={jest.fn()}
        testID="section"
      />,
    );
    expect(screen.getByText('Friend requests')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('renders friend rows when friends are present', async () => {
    await render(
      <ProfileFriendsSection
        requests={[]}
        friends={[friend]}
        onOpenList={jest.fn()}
        testID="section"
      />,
    );
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.queryByText('No friends yet')).toBeNull();
  });

  it('calls onOpenList when the section is tapped', async () => {
    const onOpenList = jest.fn();
    await render(
      <ProfileFriendsSection requests={[]} friends={[]} onOpenList={onOpenList} testID="section" />,
    );
    await fireEvent.press(screen.getByTestId('section'));
    expect(onOpenList).toHaveBeenCalledTimes(1);
  });
});
