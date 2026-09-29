/** Outside `src/app/` — see `sendFriendRequestScreen.test.tsx`. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { initI18n } from '@/i18n';

import { presentedRequests } from './presentedRequests';
import type { FriendRequestDto } from './types';

const mockState = {
  requests: { data: undefined as FriendRequestDto[] | undefined, isPending: false },
  respond: jest.fn(async () => undefined),
};
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => ({ id: '7' }),
}));

jest.mock('@/features/friends/api/queries', () => ({
  useFriendRequests: () => mockState.requests,
}));

jest.mock('@/features/friends/api/mutations', () => ({
  useRespondFriendRequest: () => ({ mutateAsync: mockState.respond, isPending: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReceiveFriendRequestScreen = require('@/app/friend-request/[id]').default as () => ReactNode;

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function requestDto(id: number): FriendRequestDto {
  return {
    id,
    sender: {
      id: 90,
      displayName: 'Cattie Oi',
      avatarUrl: null,
      isPro: false,
      memberSince: '2024-06-01T00:00:00.000Z',
    },
    mutualFriendCount: 25,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

async function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ReceiveFriendRequestScreen />
    </SafeAreaProvider>,
  );
}

beforeAll(() => {
  initI18n();
});

beforeEach(() => {
  mockBack.mockClear();
  mockState.respond.mockClear();
  mockState.requests = { data: [requestDto(7)], isPending: false };
  presentedRequests.reset();
});

describe('ReceiveFriendRequestScreen', () => {
  it('renders the sender copy and the mutual-friend strip', async () => {
    await renderScreen();
    expect(screen.getByTestId('friend-receive-modal')).toBeTruthy();
    expect(screen.getByText('Friend request from\n“Cattie Oi”')).toBeTruthy();
    expect(screen.getByText('25 mutual friends')).toBeTruthy();
  });

  it('marks the request as presented on mount so it never auto-presents twice', async () => {
    await renderScreen();
    expect(presentedRequests.has(7)).toBe(true);
  });

  it('accepts the request and dismisses', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('friend-accept'));

    await waitFor(() => expect(mockState.respond).toHaveBeenCalledWith({ id: 7, accept: true }));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });

  it('dismisses without declining (iOS never declines from this sheet)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('friend-receive-dismiss'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockState.respond).not.toHaveBeenCalled();
  });

  it('dismisses when the request is no longer in the list', async () => {
    mockState.requests = { data: [], isPending: false };
    await renderScreen();
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });

  it('waits instead of dismissing while the list is still loading', async () => {
    mockState.requests = { data: undefined, isPending: true };
    await renderScreen();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
