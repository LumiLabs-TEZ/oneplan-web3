/**
 * Lives outside `src/app/` on purpose — expo-router's typed-route generator treats every file
 * under the app root as a route (see `src/links/nativeIntent.test.ts`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import {
  activeRootModal,
  resetRootModalPresenter,
  setActiveRootModal,
} from '@/features/shell/rootModals';
import { initI18n } from '@/i18n';

import type { FriendPreviewDto, FriendRequestStatus } from './types';

const mockState = {
  preview: {
    data: undefined as FriendPreviewDto | undefined,
    isLoading: false,
    isError: false,
  },
  send: jest.fn(async () => undefined),
  cancel: jest.fn(async () => undefined),
};
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => ({ code: 'abc123' }),
}));

jest.mock('@/features/friends/api/queries', () => ({
  useFriendPreview: () => mockState.preview,
}));

jest.mock('@/features/friends/api/mutations', () => ({
  useSendFriendRequest: () => ({ mutateAsync: mockState.send, isPending: false }),
  useCancelFriendRequest: () => ({ mutateAsync: mockState.cancel, isPending: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SendFriendRequestScreen = require('@/app/friend/[code]').default as () => ReactNode;

function preview(status: FriendRequestStatus): FriendPreviewDto {
  return {
    userId: 9,
    displayName: 'Bella Oi',
    avatarUrl: null,
    memberSince: '2025-03-09T00:00:00.000Z',
    mutualFriendCount: 3,
    tripCount: 4,
    countryCount: 2,
    cityCount: 7,
    requestStatus: status,
  };
}

/** `SafeAreaProvider` never measures under Jest, so the screen needs seeded metrics. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <SendFriendRequestScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(() => {
  initI18n();
});

beforeEach(() => {
  mockBack.mockClear();
  mockState.send.mockClear();
  mockState.cancel.mockClear();
  mockState.preview = { data: undefined, isLoading: false, isError: false };
  resetRootModalPresenter();
});

describe('SendFriendRequestScreen', () => {
  it('shows the skeleton while the preview loads', async () => {
    mockState.preview = { data: undefined, isLoading: true, isError: false };
    await renderScreen();
    expect(screen.getByTestId('friend-send-modal')).toBeTruthy();
    expect(screen.queryByTestId('friend-add')).toBeNull();
  });

  it('shows the error copy when the preview fails', async () => {
    mockState.preview = { data: undefined, isLoading: false, isError: true };
    await renderScreen();
    expect(screen.getByText('Failed to load profile')).toBeTruthy();
  });

  it('offers Add Friend for an unconnected profile and sends the request', async () => {
    mockState.preview = { data: preview('none'), isLoading: false, isError: false };
    await renderScreen();

    expect(screen.getByText('Bella Oi')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('friend-add'));

    expect(mockState.send).toHaveBeenCalledWith('abc123');
    // Sent this session → the confirmation text replaces the button.
    expect(await screen.findByTestId('friend-request-sent')).toBeTruthy();
    expect(screen.queryByTestId('friend-add')).toBeNull();
  });

  it('offers Cancel Request for an already-sent request and reports the cancel', async () => {
    mockState.preview = { data: preview('pending_sent'), isLoading: false, isError: false };
    await renderScreen();

    await fireEvent.press(screen.getByTestId('friend-cancel-request'));

    expect(mockState.cancel).toHaveBeenCalledWith('abc123');
    expect(await screen.findByText('Request canceled')).toBeTruthy();
    expect(screen.queryByTestId('friend-cancel-request')).toBeNull();
  });

  it('shows the read-only state for an incoming request', async () => {
    mockState.preview = { data: preview('pending_received'), isLoading: false, isError: false };
    await renderScreen();
    expect(screen.getByText('Pending your response')).toBeTruthy();
    expect(screen.queryByTestId('friend-add')).toBeNull();
  });

  it('shows the read-only state for an existing friend', async () => {
    mockState.preview = { data: preview('friends'), isLoading: false, isError: false };
    await renderScreen();
    expect(screen.getByText('Already friends')).toBeTruthy();
    expect(screen.queryByTestId('friend-add')).toBeNull();
  });

  it('dismisses without sending anything', async () => {
    mockState.preview = { data: preview('none'), isLoading: false, isError: false };
    await renderScreen();
    await fireEvent.press(screen.getByTestId('friend-send-dismiss'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockState.send).not.toHaveBeenCalled();
  });
});

describe('SendFriendRequestScreen — root-modal window', () => {
  it('claims the window on mount and releases it on unmount', async () => {
    mockState.preview = { data: preview('none'), isLoading: false, isError: false };
    const view = await renderScreen();

    expect(activeRootModal()).toEqual({ kind: 'friendCode', code: 'abc123' });

    await act(async () => {
      view.unmount();
    });
    expect(activeRootModal()).toBeNull();
  });

  it('does not steal the window from a modal that already owns it', async () => {
    setActiveRootModal({ kind: 'friendRequest', id: 4 });
    mockState.preview = { data: preview('none'), isLoading: false, isError: false };
    const view = await renderScreen();

    expect(activeRootModal()).toEqual({ kind: 'friendRequest', id: 4 });

    // ...and closing on top of it leaves the friend-request modal still presented.
    await act(async () => {
      view.unmount();
    });
    expect(activeRootModal()).toEqual({ kind: 'friendRequest', id: 4 });
  });
});
