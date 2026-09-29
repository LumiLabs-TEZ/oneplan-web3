import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { keys } from '@/api/keys';
import { useAuthStore } from '@/auth/authStore';
import type { FriendRequestDto } from '@/features/friends/types';
import { liveRequests, presentedRequests } from '@/features/friends/presentedRequests';
import { pendingInvitesStore } from '@/features/invite/pendingInvitesStore';

import { markRootModalDismissed, resetRootModalPresenter, setActiveRootModal } from './rootModals';
import { useRootModalPresenter } from './useRootModalPresenter';

// `mock`-prefixed so babel-plugin-jest-hoist allows them inside the hoisted factories.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const mockGate = { blocked: false };
jest.mock('@/native/versionGate', () => ({ useVersionGateBlocked: () => mockGate.blocked }));

let mockFreeTrialEligible = false;
const mockMarkFreeTrialShown = jest.fn();
jest.mock('@/features/subscription/useFreeTrialEligibility', () => ({
  useFreeTrialEligibility: () => mockFreeTrialEligible,
  markFreeTrialShown: () => mockMarkFreeTrialShown(),
}));

function request(id: number): FriendRequestDto {
  return {
    id,
    sender: {
      id: id * 10,
      displayName: `Sender ${id}`,
      avatarUrl: null,
      isPro: false,
      memberSince: '2025-01-01T00:00:00.000Z',
    },
    mutualFriendCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

/** Requests received over the websocket this session — the only ones that auto-present. */
function live(...requests: FriendRequestDto[]): FriendRequestDto[] {
  for (const r of requests) liveRequests.add(r.id);
  return requests;
}

function makeClient(requests?: FriendRequestDto[]): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(keys.friends.requests, requests ?? []);
  return qc;
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

async function mount(qc: QueryClient) {
  return renderHook(() => useRootModalPresenter(), { wrapper: wrapperFor(qc) });
}

beforeEach(() => {
  mockPush.mockClear();
  mockMarkFreeTrialShown.mockClear();
  mockGate.blocked = false;
  mockFreeTrialEligible = false;
  resetRootModalPresenter();
  pendingInvitesStore.reset();
  useAuthStore.setState({ status: 'authed' });
});

describe('useRootModalPresenter — gating', () => {
  it('presents nothing while signed out', async () => {
    useAuthStore.setState({ status: 'anon' });
    await mount(makeClient(live(request(1))));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('presents nothing behind the forced-update gate', async () => {
    mockGate.blocked = true;
    await mount(makeClient(live(request(1))));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('presents nothing when nothing is pending', async () => {
    await mount(makeClient());
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('useRootModalPresenter — trip invites', () => {
  it('pops the queue and pushes the join screen once', async () => {
    pendingInvitesStore.upsert(
      { inviteCode: 'ABC', tripName: 'Trip', coverImageUrl: null, invitedByDisplayName: '' },
      'websocket',
    );
    const view = await mount(makeClient());

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/join/[code]', params: { code: 'ABC' } }),
    );
    expect(mockPush).toHaveBeenCalledTimes(1);

    // A second invite arriving while the first is presented must not re-push.
    await act(async () => {
      pendingInvitesStore.upsert(
        { inviteCode: 'DEF', tripName: 'Trip 2', coverImageUrl: null, invitedByDisplayName: '' },
        'websocket',
      );
    });
    view.rerender(undefined);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('never auto-presents invites that were only fetched (banner-only)', async () => {
    pendingInvitesStore.upsert(
      { inviteCode: 'ABC', tripName: 'Trip', coverImageUrl: null, invitedByDisplayName: '' },
      'api',
    );
    await mount(makeClient());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('presents the next queued invite after the first is dismissed', async () => {
    pendingInvitesStore.upsert(
      { inviteCode: 'ABC', tripName: 'Trip', coverImageUrl: null, invitedByDisplayName: '' },
      'websocket',
    );
    pendingInvitesStore.upsert(
      { inviteCode: 'DEF', tripName: 'Trip 2', coverImageUrl: null, invitedByDisplayName: '' },
      'websocket',
    );
    await mount(makeClient());
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));

    await act(async () => {
      pendingInvitesStore.resolve('ABC');
    });
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/join/[code]', params: { code: 'DEF' } }),
    );
  });
});

describe('useRootModalPresenter — free trial', () => {
  it('pushes /free-trial and beats a pending friend request/invite', async () => {
    pendingInvitesStore.upsert(
      { inviteCode: 'ABC', tripName: 'Trip', coverImageUrl: null, invitedByDisplayName: '' },
      'websocket',
    );
    mockFreeTrialEligible = true;
    await mount(makeClient(live(request(7))));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/free-trial'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockMarkFreeTrialShown).toHaveBeenCalledTimes(1);
  });

  it('presents the next modal once the free-trial screen clears the window', async () => {
    mockFreeTrialEligible = true;
    await mount(makeClient(live(request(7))));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/free-trial'));

    mockFreeTrialEligible = false;
    await act(async () => {
      markRootModalDismissed('freeTrial');
    });

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/friend-request/[id]',
        params: { id: '7' },
      }),
    );
  });
});

describe('useRootModalPresenter — friend requests', () => {
  it('pushes the receive modal once per request id', async () => {
    const view = await mount(makeClient(live(request(7))));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/friend-request/[id]',
        params: { id: '7' },
      }),
    );
    expect(mockPush).toHaveBeenCalledTimes(1);

    // Dismissing frees the window, but the id is marked as presented for the session.
    await act(async () => {
      markRootModalDismissed();
    });
    view.rerender(undefined);
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  });

  it('presents the next unseen request after the first is dismissed', async () => {
    await mount(makeClient(live(request(7), request(8))));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));

    await act(async () => {
      markRootModalDismissed();
    });
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/friend-request/[id]',
        params: { id: '8' },
      }),
    );
  });

  it('beats a queued trip invite', async () => {
    pendingInvitesStore.upsert(
      { inviteCode: 'ABC', tripName: 'Trip', coverImageUrl: null, invitedByDisplayName: '' },
      'websocket',
    );
    await mount(makeClient(live(request(7))));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/friend-request/[id]',
      params: { id: '7' },
    });
  });

  it('never auto-presents requests that were only fetched (banner-only)', async () => {
    await mount(makeClient([request(7), request(8)]));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('presents a fetched request once it also arrives over the websocket', async () => {
    await mount(makeClient([request(7), request(8)]));
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      liveRequests.add(8);
    });
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/friend-request/[id]',
        params: { id: '8' },
      }),
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('does not re-present a request already marked as presented', async () => {
    presentedRequests.add(7);
    await mount(makeClient(live(request(7))));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('useRootModalPresenter — friend code', () => {
  it('never pushes the send modal itself (friend codes navigate directly)', async () => {
    await mount(makeClient());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('presents nothing while a friend-code screen owns the window', async () => {
    setActiveRootModal({ kind: 'friendCode', code: 'abc123' });
    await mount(makeClient(live(request(7))));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
