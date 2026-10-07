/**
 * `/trip/new` friends card + invite-on-create (`CreateTripView.swift:207-272, 376-403`). Lives
 * outside `src/app/` so expo-router doesn't treat it as a route.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';
import type { FriendDto } from '@/features/friends/types';
import { initI18n } from '@/i18n';

import { createTripStore } from './createTripStore';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockCreate = jest.fn();
const mockInvite = jest.fn();
let mockFriends: FriendDto[] = [];
let mockWeb3Enabled = false;

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock('@/features/friends/api/queries', () => ({
  useFriends: () => ({ data: mockFriends, isLoading: false }),
  mutualLabel: (count: number) => `${count} mutual friends`,
}));

jest.mock('@/features/me/useMe', () => ({ useIsPro: () => true }));

jest.mock('@/features/vault/web3Flag', () => ({ useWeb3Enabled: () => mockWeb3Enabled }));

jest.mock('@/features/trip/api/queries', () => ({
  useTrips: () => ({ refetch: jest.fn() }),
}));

jest.mock('@/features/trip/api/mutations', () => ({
  useCreateTrip: () => ({ mutateAsync: (...args: unknown[]) => mockCreate(...args) }),
  invalidateTrip: jest.fn(),
}));

jest.mock('@/features/trip/api/inviteMembers', () => ({
  inviteMembers: (...args: unknown[]) => mockInvite(...args),
}));

jest.mock('@/features/trip/components/TripDurationSheet', () => ({
  TripDurationSheet: () => null,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const NewTripScreen = require('@/app/trip/new/index').default as () => ReactNode;

type LocationSearchResultDto = components['schemas']['LocationSearchResultDto'];

const hanoi = {
  city: { id: 1, name: 'Hanoi', latitude: '21.03', longitude: '105.85' },
  state: { id: 10, name: 'Hanoi', iso2: 'HN', type: 'city', latitude: null, longitude: null },
  country: {
    id: 100,
    name: 'Vietnam',
    iso2: 'VN',
    iso3: 'VNM',
    phoneCode: '84',
    capital: 'Hanoi',
    currency: 'VND',
    region: 'Asia',
    subRegion: 'South-Eastern Asia',
    emoji: '🇻🇳',
  },
} as LocationSearchResultDto;

function friend(id: number): FriendDto {
  return {
    friendshipId: id * 10,
    mutualFriendCount: 0,
    user: { id, displayName: `Friend ${id}`, avatarUrl: null, isPro: false },
  } as unknown as FriendDto;
}

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <NewTripScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function fillDraft() {
  createTripStore.setName('Hanoi trip');
  createTripStore.setLocation(hanoi);
}

beforeAll(() => {
  initI18n();
});

beforeEach(() => {
  createTripStore.reset();
  mockFriends = [];
  mockWeb3Enabled = false;
  mockReplace.mockClear();
  mockPush.mockClear();
  mockCreate.mockReset().mockResolvedValue({ id: 42 });
  mockInvite.mockReset().mockResolvedValue([]);
});

describe('NewTripScreen friends card', () => {
  it('shows the empty-friends state when there are no friends', async () => {
    await renderScreen();
    expect(screen.getByTestId('new-trip-friends-empty')).toBeTruthy();
    expect(screen.queryByTestId('new-trip-friends-search')).toBeNull();
  });

  it('previews at most five friends and opens the full list from Search', async () => {
    mockFriends = [1, 2, 3, 4, 5, 6, 7].map(friend);
    await renderScreen();

    expect(screen.getByText('7 friends')).toBeTruthy();
    expect(screen.getByTestId('new-trip-friend-5')).toBeTruthy();
    expect(screen.queryByTestId('new-trip-friend-6')).toBeNull();

    await fireEvent.press(screen.getByTestId('new-trip-friends-search'));
    expect(mockPush).toHaveBeenCalledWith('/trip/new/friends');
  });

  it('flips Invite to Sent without calling the server', async () => {
    mockFriends = [friend(1)];
    await renderScreen();

    await fireEvent.press(screen.getByTestId('new-trip-friend-1-trailing'));

    expect(screen.getByText('Sent')).toBeTruthy();
    expect(mockInvite).not.toHaveBeenCalled();
  });
});

describe('NewTripScreen submit', () => {
  it('invites the selected friends after creating the trip, then opens it', async () => {
    mockFriends = [friend(3), friend(1)];
    fillDraft();
    await renderScreen();

    await fireEvent.press(screen.getByTestId('new-trip-friend-3-trailing'));
    await fireEvent.press(screen.getByTestId('new-trip-friend-1-trailing'));
    await fireEvent.press(screen.getByTestId('create-trip-submit'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockInvite).toHaveBeenCalledWith(42, [1, 3]);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/trip/[tripId]',
      params: { tripId: '42' },
    });
  });

  it('skips the invite call when no friend was selected', async () => {
    mockFriends = [friend(1)];
    fillDraft();
    await renderScreen();

    await fireEvent.press(screen.getByTestId('create-trip-submit'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockInvite).not.toHaveBeenCalled();
  });

  it('warns when invites fail and opens the trip only from OK', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockInvite.mockRejectedValue(new Error('boom'));
    mockFriends = [friend(1)];
    fillDraft();
    await renderScreen();

    await fireEvent.press(screen.getByTestId('new-trip-friend-1-trailing'));
    await fireEvent.press(screen.getByTestId('create-trip-submit'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const [title, , buttons] = alertSpy.mock.calls[0]!;
    expect(title).toBe('Trip created with warnings');
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      buttons?.[0]?.onPress?.();
    });
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/trip/[tripId]',
      params: { tripId: '42' },
    });
    alertSpy.mockRestore();
  });
});

describe('NewTripScreen group wallet switch', () => {
  it('is hidden for a user who is not web3-eligible, and the body has no web3', async () => {
    fillDraft();
    await renderScreen();

    expect(screen.queryByTestId('group-wallet-row')).toBeNull();
    await fireEvent.press(screen.getByTestId('create-trip-submit'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]![0]).not.toHaveProperty('web3');
  });

  it('is off by default for an eligible user', async () => {
    mockWeb3Enabled = true;
    fillDraft();
    await renderScreen();

    expect(screen.getByText('Group wallet')).toBeTruthy();
    expect(screen.getByTestId('group-wallet-toggle').props.value).toBe(false);
    await fireEvent.press(screen.getByTestId('create-trip-submit'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]![0]).not.toHaveProperty('web3');
  });

  it('creates a web3 trip when switched on', async () => {
    mockWeb3Enabled = true;
    fillDraft();
    await renderScreen();

    await fireEvent(screen.getByTestId('group-wallet-toggle'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('create-trip-submit'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({ web3: true });
  });

  it('turns the switch off and explains when the server says web3_unavailable', async () => {
    mockWeb3Enabled = true;
    mockCreate.mockRejectedValue(
      new ApiMutationError(403, { code: 'web3_unavailable', message: 'nope' }),
    );
    fillDraft();
    await renderScreen();

    await fireEvent(screen.getByTestId('group-wallet-toggle'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('create-trip-submit'));

    expect(
      await screen.findByText(
        'Group wallet is not available in your region. Create the trip without it.',
      ),
    ).toBeTruthy();
    expect(createTripStore.getState().web3).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
