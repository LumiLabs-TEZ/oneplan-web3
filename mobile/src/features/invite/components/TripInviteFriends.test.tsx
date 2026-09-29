import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';
import { Alert } from 'react-native';

import { initI18n } from '@/i18n';

import type { TripMemberDto } from '@/features/trip/types';
import { TripInviteFriends } from './TripInviteFriends';

// `CommunityProfileRow` navigates to the friend's public plans since Phase 7; keep the router out.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockMutateAsync = jest.fn();
jest.mock('@/features/trip/api/inviteMembers', () => ({
  useInviteMembers: () => ({ mutateAsync: mockMutateAsync }),
}));

let mockFriends: {
  user: { id: number; displayName: string; avatarUrl: string | null; isPro: boolean };
  mutualFriendCount: number;
}[] = [];
jest.mock('@/features/friends/api/queries', () => {
  const actual = jest.requireActual('@/features/friends/api/queries');
  return {
    ...actual,
    useFriends: () => ({ data: mockFriends }),
  };
});

function friend(overrides: {
  id: number;
  displayName?: string;
  mutualFriendCount?: number;
  isPro?: boolean;
}) {
  return {
    user: {
      id: overrides.id,
      displayName: overrides.displayName ?? `Friend ${overrides.id}`,
      avatarUrl: null,
      isPro: overrides.isPro ?? false,
    },
    mutualFriendCount: overrides.mutualFriendCount ?? 0,
  };
}

function member(userId: number): TripMemberDto {
  return {
    id: userId,
    userId,
    displayName: `Member ${userId}`,
    avatarUrl: null,
    inviteStatus: 'ACCEPTED',
    role: 'MEMBER',
    isPro: false,
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = React.useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('TripInviteFriends', () => {
  beforeAll(() => {
    initI18n();
  });

  afterEach(() => {
    mockFriends = [];
    mockMutateAsync.mockReset();
  });

  it('renders nothing when there are no friends left to invite', async () => {
    mockFriends = [];
    const screen = await render(
      <Wrapper>
        <TripInviteFriends tripId={1} members={[]} />
      </Wrapper>,
    );

    expect(screen.queryByText('Friends')).toBeNull();
  });

  it('hides friends who are already trip members', async () => {
    mockFriends = [friend({ id: 2 }), friend({ id: 3, displayName: 'Not a member' })];
    const screen = await render(
      <Wrapper>
        <TripInviteFriends tripId={1} members={[member(2)]} />
      </Wrapper>,
    );

    expect(screen.queryByText('Friend 2')).toBeNull();
    expect(screen.getByText('Not a member')).toBeTruthy();
  });

  it('invites a friend and flips the row to Sent', async () => {
    mockFriends = [friend({ id: 3, displayName: 'X' })];
    mockMutateAsync.mockResolvedValue([]);

    const screen = await render(
      <Wrapper>
        <TripInviteFriends tripId={1} members={[]} />
      </Wrapper>,
    );

    expect(screen.getByText('Invite')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByTestId('invite-friend-3-trailing'));
    });

    expect(mockMutateAsync).toHaveBeenCalledWith([3]);
    await waitFor(() => expect(screen.getByText('Sent')).toBeTruthy());
    expect(screen.getByTestId('invite-friend-3-trailing').props.accessibilityState?.disabled).toBe(
      true,
    );
  });

  it('shows an alert and keeps the Invite pill when the request fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockFriends = [friend({ id: 4, displayName: 'Y' })];
    mockMutateAsync.mockRejectedValue(new Error('boom'));

    const screen = await render(
      <Wrapper>
        <TripInviteFriends tripId={1} members={[]} />
      </Wrapper>,
    );

    await act(async () => {
      await fireEvent.press(screen.getByTestId('invite-friend-4-trailing'));
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(screen.getByText('Invite')).toBeTruthy();

    alertSpy.mockRestore();
  });
});
