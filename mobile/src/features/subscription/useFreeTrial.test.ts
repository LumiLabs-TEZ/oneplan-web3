import { createTestQueryClient } from '@/testSupport/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ProductSubscription } from 'expo-iap';
import type { ReactNode } from 'react';
import React from 'react';
import { Alert } from 'react-native';

import { keys } from '@/api/keys';
import { initI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

import type { SubscriptionTier } from './types';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));

const mockLoadProducts = jest.fn(async () => ({ subs: [], packs: [] }));
const mockPurchasePro = jest.fn();

let mockStoreState = {
  products: { subs: [] as ProductSubscription[], packs: [] },
  purchasing: false,
};

jest.mock('@/iap', () => {
  const actual = jest.requireActual('@/iap');
  return {
    ...actual,
    StoreService: {
      loadProducts: () => mockLoadProducts(),
      purchasePro: (sku: string) => mockPurchasePro(sku),
    },
    useStore: () => mockStoreState,
  };
});

// eslint-disable-next-line import/first -- must follow the jest.mock calls above
import { useFreeTrial } from './useFreeTrial';

function monthlyProduct(price = '$9.99'): ProductSubscription {
  return {
    id: 'pro_monthly',
    type: 'subs',
    platform: 'ios',
    title: 'pro_monthly',
    description: 'desc',
    displayPrice: price,
    currency: 'USD',
    price: 9.99,
  } as ProductSubscription;
}

function statusFor(tier: SubscriptionTier) {
  return { tier, status: 'ACTIVE' };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = createTestQueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

beforeAll(() => {
  initI18n();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreState = { products: { subs: [], packs: [] }, purchasing: false };
  useSettingsStore.setState({ trialOfferDeadline: Date.now() + 3_600_000 });
});

describe('useFreeTrial', () => {
  it('loads products on mount when none are cached', async () => {
    const { unmount } = await renderHook(() => useFreeTrial(), { wrapper });
    expect(mockLoadProducts).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not reload products when already cached', async () => {
    mockStoreState = { products: { subs: [monthlyProduct()], packs: [] }, purchasing: false };
    const { unmount } = await renderHook(() => useFreeTrial(), { wrapper });
    expect(mockLoadProducts).not.toHaveBeenCalled();
    unmount();
  });

  it('exposes the pro_monthly product once loaded', async () => {
    mockStoreState = {
      products: { subs: [monthlyProduct('$12.99')], packs: [] },
      purchasing: false,
    };
    const { result, unmount } = await renderHook(() => useFreeTrial(), { wrapper });
    expect(result.current.product?.displayPrice).toBe('$12.99');
    unmount();
  });

  it('ticks the remaining countdown every second', async () => {
    jest.useFakeTimers();
    const deadline = Date.now() + 5_000;
    useSettingsStore.setState({ trialOfferDeadline: deadline });
    const { result, unmount } = await renderHook(() => useFreeTrial(), { wrapper });
    expect(result.current.remaining.sec).toBe(5);

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(result.current.remaining.sec).toBe(3);
    unmount();
    jest.useRealTimers();
  });

  it('auto-closes once the countdown reaches zero', async () => {
    jest.useFakeTimers();
    useSettingsStore.setState({ trialOfferDeadline: Date.now() + 2_000 });
    const { unmount } = await renderHook(() => useFreeTrial(), { wrapper });

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    unmount();
    jest.useRealTimers();
  });

  it('auto-close fires exactly once even as the (still-running) countdown keeps ticking past expiry', async () => {
    // Regression: the 1s interval used to keep running after expiry, re-firing the auto-dismiss
    // effect (and `router.back()`) on every subsequent tick.
    jest.useFakeTimers();
    useSettingsStore.setState({ trialOfferDeadline: Date.now() + 2_000 });
    const { unmount } = await renderHook(() => useFreeTrial(), { wrapper });

    await act(async () => {
      jest.advanceTimersByTime(10_000); // well past expiry — 8+ extra 1s ticks
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    unmount();
    jest.useRealTimers();
  });

  it('a later countdown tick after a successful purchase-close does not call back() again', async () => {
    jest.useFakeTimers();
    const qc = createTestQueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(keys.subscription.status, statusFor('pro_monthly'));
    mockPurchasePro.mockResolvedValue('purchased');
    useSettingsStore.setState({ trialOfferDeadline: Date.now() + 3_600_000 });

    const { result, unmount } = await renderHook(() => useFreeTrial(), {
      wrapper: ({ children }) => React.createElement(QueryClientProvider, { client: qc }, children),
    });

    await act(async () => result.current.start());
    expect(mockBack).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5_000); // several more 1s ticks after the purchase already closed it
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    unmount();
    jest.useRealTimers();
  });

  it('start() purchases pro_monthly and closes once the cached tier catches up (success haptic + back)', async () => {
    const qc = createTestQueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(keys.subscription.status, statusFor('pro_monthly'));
    mockPurchasePro.mockResolvedValue('purchased');

    const { result, unmount } = await renderHook(() => useFreeTrial(), {
      wrapper: ({ children }) => React.createElement(QueryClientProvider, { client: qc }, children),
    });

    await act(async () => result.current.start());

    expect(mockPurchasePro).toHaveBeenCalledWith('pro_monthly');
    expect(mockBack).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('start() does not close when "purchased" resolves but the cached tier is still stale', async () => {
    mockPurchasePro.mockResolvedValue('purchased');
    const { result, unmount } = await renderHook(() => useFreeTrial(), { wrapper });

    await act(async () => result.current.start());

    expect(mockBack).not.toHaveBeenCalled();
    unmount();
  });

  it('start() alerts "Purchase pending approval" on a pending outcome', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPurchasePro.mockResolvedValue('pending');
    const { result, unmount } = await renderHook(() => useFreeTrial(), { wrapper });

    await act(async () => result.current.start());

    expect(alertSpy).toHaveBeenCalledWith('Purchase pending approval');
    expect(mockBack).not.toHaveBeenCalled();
    unmount();
  });

  it('start() alerts the translated StoreError on a thrown failure', async () => {
    const { StoreError } = jest.requireActual('@/iap');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPurchasePro.mockRejectedValue(
      new StoreError({ key: 'Purchase failed: %@', params: { 0: 'boom' } }),
    );
    const { result, unmount } = await renderHook(() => useFreeTrial(), { wrapper });

    await act(async () => result.current.start());

    expect(alertSpy).toHaveBeenCalledWith('Purchase failed: boom');
    unmount();
  });

  it('close() navigates back', async () => {
    const { result, unmount } = await renderHook(() => useFreeTrial(), { wrapper });
    await act(async () => result.current.close());
    expect(mockBack).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('calling close() twice only calls back() once', async () => {
    const { result, unmount } = await renderHook(() => useFreeTrial(), { wrapper });
    await act(async () => result.current.close());
    await act(async () => result.current.close());
    expect(mockBack).toHaveBeenCalledTimes(1);
    unmount();
  });
});
