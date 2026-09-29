/**
 * Regression coverage for the free-trial re-push loop (review fix round 1, item 1): dismissing
 * `/free-trial` must not immediately re-push it. Uses the REAL `useFreeTrialEligibility` (no
 * mocking of that module) wired through the real presenter — only the store-eligibility check
 * (`StoreService.isEligibleForFreeTrial`) and the network-backed subscription-status query are
 * stubbed, everything else (settingsStore, rootModals, the presenter's own logic) is real.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { keys } from '@/api/keys';
import { useAuthStore } from '@/auth/authStore';
import type { SubscriptionStatusDto } from '@/features/subscription/types';
import { useSettingsStore } from '@/stores/settingsStore';

import { markRootModalDismissed, resetRootModalPresenter } from './rootModals';
import { useRootModalPresenter } from './useRootModalPresenter';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

jest.mock('@/native/versionGate', () => ({ useVersionGateBlocked: () => false }));

let mockEligible = true;
jest.mock('@/iap', () => ({
  StoreService: { isEligibleForFreeTrial: () => Promise.resolve(mockEligible) },
}));

// eslint-disable-next-line import/first -- must follow the jest.mock calls above
import { _resetForTests as resetFreeTrialEligibility } from '@/features/subscription/useFreeTrialEligibility';

function makeClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(keys.friends.requests, []);
  qc.setQueryData<SubscriptionStatusDto>(keys.subscription.status, {
    tier: 'free',
    status: 'NONE',
  } as SubscriptionStatusDto);
  return qc;
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

beforeEach(() => {
  mockPush.mockClear();
  mockEligible = true;
  resetRootModalPresenter();
  resetFreeTrialEligibility();
  useAuthStore.setState({ status: 'authed' });
  useSettingsStore.setState({ trialOfferDeadline: null });
});

describe('useRootModalPresenter + real useFreeTrialEligibility — free-trial loop regression', () => {
  it('pushes /free-trial once; dismissing it does not immediately re-push', async () => {
    const view = await renderHook(() => useRootModalPresenter(), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/free-trial'));
    expect(mockPush).toHaveBeenCalledTimes(1);

    await act(async () => {
      markRootModalDismissed('freeTrial');
      view.rerender(undefined);
      // Give any stray microtask/effect a chance to fire before asserting the negative.
      await Promise.resolve();
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
