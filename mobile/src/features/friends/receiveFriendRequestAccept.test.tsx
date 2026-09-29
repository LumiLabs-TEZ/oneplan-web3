/**
 * Accept path with the *real* query + mutation wiring (only the HTTP client is faked), so the
 * screen sees exactly what it sees in the app: `useRespondFriendRequest.onSuccess` drops the row
 * from the `friends.requests` cache synchronously, which immediately arms the "resolved
 * elsewhere" effect. The screen must still pop exactly once.
 *
 * Outside `src/app/` — see `sendFriendRequestScreen.test.tsx`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { useAuthStore } from '@/auth/authStore';
import { initI18n } from '@/i18n';

import { presentedRequests } from './presentedRequests';
import type { FriendRequestDto } from './types';

const mockApi = {
  requests: [] as FriendRequestDto[],
  // Accepting resolves the request server-side too, so the invalidation refetch returns a list
  // without it — exactly the sequence that used to pop the screen twice.
  patch: jest.fn(async () => {
    mockApi.requests = mockApi.requests.filter((r) => r.id !== 7);
    return { data: undefined, response: { ok: true, status: 200 } };
  }),
};
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => ({ id: '7' }),
}));

// Minimal openapi-fetch stand-in: the two calls this screen makes.
jest.mock('@/api/client', () => ({
  api: {
    GET: jest.fn(async () => ({
      data: mockApi.requests,
      response: { ok: true, status: 200 },
    })),
    PATCH: (...args: unknown[]) => mockApi.patch(...(args as [])),
  },
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <ReceiveFriendRequestScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(() => {
  initI18n();
});

beforeEach(() => {
  mockBack.mockClear();
  mockApi.patch.mockClear();
  mockApi.requests = [requestDto(7)];
  presentedRequests.reset();
  useAuthStore.setState({ status: 'authed' });
});

describe('ReceiveFriendRequestScreen — accept (real mutation path)', () => {
  it('responds once and pops exactly once, despite the cache row disappearing', async () => {
    await renderScreen();
    await screen.findByTestId('friend-accept');

    await fireEvent.press(screen.getByTestId('friend-accept'));

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    // Let the invalidation-driven re-render settle: the "resolved elsewhere" effect now sees no
    // request, and must not pop a second screen off the stack.
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('pops only once when the request vanishes without an accept', async () => {
    mockApi.requests = [];
    await renderScreen();
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockApi.patch).not.toHaveBeenCalled();
  });
});
