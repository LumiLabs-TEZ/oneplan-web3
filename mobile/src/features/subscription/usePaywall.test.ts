import { createTestQueryClient } from '@/testSupport/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ProductSubscription } from 'expo-iap';
import type { ReactNode } from 'react';
import React from 'react';
import { Alert } from 'react-native';

import { keys } from '@/api/keys';
import { initI18n } from '@/i18n';

import type { SubscriptionStatusDto, SubscriptionTier } from './types';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));

const mockTrack = jest.fn();
jest.mock('@/analytics/track', () => ({ track: (...args: unknown[]) => mockTrack(...args) }));

let mockIsPro = false;
let mockCurrentTier: SubscriptionTier = 'free';
let mockStatusQuery: { data: SubscriptionStatusDto | undefined; isError: boolean } = {
  data: undefined,
  isError: false,
};
jest.mock('./api/queries', () => ({
  useIsPro: () => mockIsPro,
  useCurrentTier: () => mockCurrentTier,
  useSubscriptionStatus: () => mockStatusQuery,
}));

const mockLoadProducts = jest.fn(async () => ({ subs: [], packs: [] }));
const mockPurchasePro = jest.fn();
const mockRestore = jest.fn();
const mockManageSubscriptions = jest.fn(async () => undefined);
const mockRedeemOfferCode = jest.fn(async () => {
  /* noop: resolves void, matching StoreService.redeemOfferCode's signature */
});

let mockStoreState = {
  products: { subs: [] as ProductSubscription[], packs: [] },
  loading: false,
  purchasing: false,
  hasPendingRetry: false,
  error: null,
};

jest.mock('@/iap', () => {
  const actual = jest.requireActual('@/iap');
  return {
    ...actual,
    StoreService: {
      loadProducts: () => mockLoadProducts(),
      purchasePro: (sku: string) => mockPurchasePro(sku),
      restore: () => mockRestore(),
      manageSubscriptions: () => mockManageSubscriptions(),
      redeemOfferCode: () => mockRedeemOfferCode(),
    },
    useStore: () => mockStoreState,
  };
});

// eslint-disable-next-line import/first -- must follow the jest.mock calls above
import { usePaywall } from './usePaywall';

function iosSub(id: string, unit: 'week' | 'month' | 'year', price = 10): ProductSubscription {
  return {
    id,
    type: 'subs',
    platform: 'ios',
    title: id,
    description: `desc-${id}`,
    displayPrice: `$${price}`,
    currency: 'USD',
    price,
    displayNameIOS: id,
    isFamilyShareableIOS: false,
    jsonRepresentationIOS: '{}',
    introductoryPricePaymentModeIOS: 'empty',
    typeIOS: 'auto-renewable-subscription',
    subscriptionPeriodUnitIOS: unit,
    subscriptionPeriodNumberIOS: '1',
  } as ProductSubscription;
}

const WEEKLY = iosSub('pro_weekly', 'week', 4.99);
const MONTHLY = iosSub('pro_monthly', 'month', 9.99);
const YEARLY = iosSub('pro_yearly', 'year', 59.99);

function statusFor(tier: SubscriptionTier): SubscriptionStatusDto {
  return { tier, status: 'ACTIVE' } as SubscriptionStatusDto;
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
  // `clearAllMocks()` only clears call history — it does NOT remove a `.mockImplementation()` set
  // by an earlier test (that's `mockReset()`), so a test overriding this one leaks its pending
  // promise into every test that runs after it. Reinstate the default each time.
  mockRedeemOfferCode.mockImplementation(async () => undefined);
  mockIsPro = false;
  mockCurrentTier = 'free';
  mockStatusQuery = { data: undefined, isError: false };
  mockStoreState = {
    products: { subs: [WEEKLY, MONTHLY, YEARLY], packs: [] },
    loading: false,
    purchasing: false,
    hasPendingRetry: false,
    error: null,
  };
});

describe('usePaywall', () => {
  it('loads products on mount and tracks SUBSCRIPTION_VIEWED', async () => {
    await renderHook(() => usePaywall(), { wrapper });
    expect(mockLoadProducts).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('SUBSCRIPTION_VIEWED');
  });

  it('statusUnavailable is false by default (no error, no data yet)', async () => {
    const { result } = await renderHook(() => usePaywall(), { wrapper });
    expect(result.current.statusUnavailable).toBe(false);
  });

  it('statusUnavailable is true when the status query errored with no cached data', async () => {
    mockStatusQuery = { data: undefined, isError: true };
    const { result } = await renderHook(() => usePaywall(), { wrapper });
    expect(result.current.statusUnavailable).toBe(true);
  });

  it('statusUnavailable is false when the status query errored but cached data exists', async () => {
    mockStatusQuery = {
      data: { tier: 'free' } as SubscriptionStatusDto,
      isError: true,
    };
    const { result } = await renderHook(() => usePaywall(), { wrapper });
    expect(result.current.statusUnavailable).toBe(false);
  });

  it('defaults selectedSku to the longest-period ("Best value") sku', async () => {
    const { result } = await renderHook(() => usePaywall(), { wrapper });
    await waitFor(() => expect(result.current.selectedSku).toBe('pro_yearly'));
  });

  it('never overrides a user selection once defaulted', async () => {
    const { result } = await renderHook(() => usePaywall(), { wrapper });
    await waitFor(() => expect(result.current.selectedSku).toBe('pro_yearly'));

    await act(async () => result.current.selectSku('pro_weekly'));
    expect(result.current.selectedSku).toBe('pro_weekly');
  });

  it('primaryAction is "subscribe" for a non-Pro user on a subscription sku', async () => {
    const { result } = await renderHook(() => usePaywall(), { wrapper });
    await waitFor(() => expect(result.current.selectedSku).toBe('pro_yearly'));
    expect(result.current.primaryAction).toBe('subscribe');
  });

  it('onPrimary purchases the selected sku and closes once the tier matches (success haptic + back)', async () => {
    const qc = createTestQueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(keys.subscription.status, statusFor('pro_yearly'));
    mockPurchasePro.mockResolvedValue('purchased');

    const { result } = await renderHook(() => usePaywall(), {
      wrapper: ({ children }) => React.createElement(QueryClientProvider, { client: qc }, children),
    });
    await waitFor(() => expect(result.current.selectedSku).toBe('pro_yearly'));

    await act(async () => result.current.onPrimary());

    expect(mockPurchasePro).toHaveBeenCalledWith('pro_yearly');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('does not close when "purchased" resolves but the cached tier has not caught up yet', async () => {
    const qc = createTestQueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(keys.subscription.status, statusFor('free'));
    mockPurchasePro.mockResolvedValue('purchased');

    const { result } = await renderHook(() => usePaywall(), {
      wrapper: ({ children }) => React.createElement(QueryClientProvider, { client: qc }, children),
    });
    await waitFor(() => expect(result.current.selectedSku).toBe('pro_yearly'));

    await act(async () => result.current.onPrimary());

    expect(mockBack).not.toHaveBeenCalled();
  });

  it('alerts "Purchase pending approval" and does not close on a pending outcome', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPurchasePro.mockResolvedValue('pending');

    const { result } = await renderHook(() => usePaywall(), { wrapper });
    await waitFor(() => expect(result.current.selectedSku).toBe('pro_yearly'));

    await act(async () => result.current.onPrimary());

    expect(alertSpy).toHaveBeenCalledWith('Purchase pending approval');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('does nothing extra on a cancelled outcome', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPurchasePro.mockResolvedValue('cancelled');

    const { result } = await renderHook(() => usePaywall(), { wrapper });
    await waitFor(() => expect(result.current.selectedSku).toBe('pro_yearly'));

    await act(async () => result.current.onPrimary());

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('alerts the translated StoreError key + params on a thrown purchase failure', async () => {
    const { StoreError } = jest.requireActual('@/iap');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPurchasePro.mockRejectedValue(
      new StoreError({ key: 'Purchase failed: %@', params: { 0: 'boom' } }),
    );

    const { result } = await renderHook(() => usePaywall(), { wrapper });
    await waitFor(() => expect(result.current.selectedSku).toBe('pro_yearly'));

    await act(async () => result.current.onPrimary());

    expect(alertSpy).toHaveBeenCalledWith('Purchase failed: boom');
  });

  it('cancel action opens Manage Subscriptions instead of purchasing', async () => {
    mockIsPro = true;
    mockCurrentTier = 'pro_yearly';

    const { result } = await renderHook(() => usePaywall(), { wrapper });
    await waitFor(() => expect(result.current.selectedSku).toBe('pro_yearly'));
    expect(result.current.primaryAction).toBe('cancel');

    await act(async () => result.current.onPrimary());

    expect(mockManageSubscriptions).toHaveBeenCalledTimes(1);
    expect(mockPurchasePro).not.toHaveBeenCalled();
  });

  it('cancel action invalidates the subscription status query', async () => {
    mockIsPro = true;
    mockCurrentTier = 'pro_yearly';
    const qc = createTestQueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    const { result } = await renderHook(() => usePaywall(), {
      wrapper: ({ children }) => React.createElement(QueryClientProvider, { client: qc }, children),
    });
    await waitFor(() => expect(result.current.selectedSku).toBe('pro_yearly'));

    await act(async () => result.current.onPrimary());

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.subscription.status });
  });

  it('onRestore tracks RESTORE_PURCHASE_CLICKED and closes when the restored status is Pro', async () => {
    mockRestore.mockResolvedValue(statusFor('pro_yearly'));

    const { result } = await renderHook(() => usePaywall(), { wrapper });
    await act(async () => result.current.onRestore());

    expect(mockTrack).toHaveBeenCalledWith('RESTORE_PURCHASE_CLICKED');
    expect(mockRestore).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('onRestore does not close when the restored status is still free', async () => {
    mockRestore.mockResolvedValue(statusFor('free'));

    const { result } = await renderHook(() => usePaywall(), { wrapper });
    await act(async () => result.current.onRestore());

    expect(mockBack).not.toHaveBeenCalled();
  });

  it('onRestore alerts the translated error on failure', async () => {
    const { StoreError } = jest.requireActual('@/iap');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockRestore.mockRejectedValue(
      new StoreError({ key: 'Could not verify your purchase with the server.' }),
    );

    const { result } = await renderHook(() => usePaywall(), { wrapper });
    await act(async () => result.current.onRestore());

    expect(alertSpy).toHaveBeenCalledWith('Could not verify your purchase with the server.');
  });

  it('onPromo redeems the offer code and closes once isPro flips true', async () => {
    // Real `redeemOfferCode()` ends with `restore()`, which applies the fresh status to the
    // query cache synchronously before the promise resolves — simulate that ordering here so the
    // post-resolve cache check (item 3) doesn't race the effect this test is exercising.
    const qc = createTestQueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolveRedeem: () => void = () => undefined;
    mockRedeemOfferCode.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRedeem = () => {
            qc.setQueryData(keys.subscription.status, statusFor('pro_yearly'));
            resolve();
          };
        }),
    );

    const { result, rerender } = await renderHook(() => usePaywall(), {
      wrapper: ({ children }) => React.createElement(QueryClientProvider, { client: qc }, children),
    });
    // Fire-and-forget: `onPromo`'s own promise only settles once `redeemOfferCode` does, so don't
    // await it here — just flush the synchronous `setAwaitingPromo(true)` at its start.
    await act(async () => {
      void result.current.onPromo();
    });

    expect(result.current.awaitingPromo).toBe(true);
    expect(mockRedeemOfferCode).toHaveBeenCalledTimes(1);

    await act(async () => resolveRedeem());
    // The cache already shows Pro by the time redeemOfferCode resolves, so awaitingPromo is left
    // alone for the entitlement-flip effect below to close it — it isn't cleared here.
    expect(result.current.awaitingPromo).toBe(true);
    expect(mockBack).not.toHaveBeenCalled();

    mockIsPro = true;
    await act(async () => rerender({}));

    expect(result.current.awaitingPromo).toBe(false);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('resets awaitingPromo once redeemOfferCode resolves but isPro is still false (dismissed without a code)', async () => {
    // Default mock resolves immediately; the cache has no Pro status, so `isProTier` reads false.
    const { result } = await renderHook(() => usePaywall(), { wrapper });
    await waitFor(() => expect(result.current.selectedSku).toBe('pro_yearly'));

    await act(async () => result.current.onPromo());

    expect(mockRedeemOfferCode).toHaveBeenCalledTimes(1);
    expect(result.current.awaitingPromo).toBe(false);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('exposes hasPendingRetry from the store slice', async () => {
    mockStoreState = { ...mockStoreState, hasPendingRetry: true };
    const { result } = await renderHook(() => usePaywall(), { wrapper });
    expect(result.current.hasPendingRetry).toBe(true);
  });
});
