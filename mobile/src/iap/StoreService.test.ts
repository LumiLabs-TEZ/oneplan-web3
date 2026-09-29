import * as IAP from 'expo-iap';
import type { Purchase } from 'expo-iap';
import { Platform } from 'react-native';

import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import { queryClient } from '@/api/queryClient';
import type { SubscriptionStatusDto } from '@/features/subscription/types';

import { ERR_RESTORE } from './purchaseFlow';
import {
  _resetStoreServiceForTests,
  ERR_LOAD_PRODUCTS,
  ERR_PURCHASE_FAILED,
  init,
  isEligibleForFreeTrial,
  loadProducts,
  manageSubscriptions,
  purchasePro,
  purchaseScanCredits,
  PURCHASE_WAIT_TIMEOUT_MS,
  reconcilePending,
  redeemOfferCode,
  restore,
  shutdown,
} from './StoreService';
import { useStore } from './useStore';

afterAll(() => {
  queryClient.unmount();
  queryClient.clear();
});

// The real query client pulls in the MMKV persister; a plain one is enough here.
jest.mock('@/api/queryClient', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory is hoisted
  const { QueryClient } = require('@tanstack/react-query');
  return { queryClient: new QueryClient(), resetQueryCache: jest.fn() };
});

jest.mock('@/features/subscription/api/mutations', () => ({
  validateAppleTransaction: jest.fn(),
  verifyPlayPurchase: jest.fn(),
  fetchAppAccountToken: jest.fn(async () => 'aaaa-bbbb'),
  syncSubscription: jest.fn(),
  applyStatus: jest.fn(),
}));

jest.mock('@/features/subscription/api/queries', () => ({
  fetchSubscriptionStatus: jest.fn(),
}));

// Mutable so the Android suites can null `androidPackage` (the real `env` is frozen, and the
// `expo-constants` jest mock has no `android.package`).
jest.mock('@/lib/env', () => ({
  env: {
    variant: 'dev',
    apiUrl: 'https://api.test',
    linkHosts: [],
    androidPackage: 'com.oneplan.app',
    foursquareApiKey: null,
    facebookAppId: null,
  },
  isProd: false,
  webSocketUrl: (path: string) => `wss://api.test${path}`,
}));

const { env } = jest.requireMock('@/lib/env') as { env: { androidPackage: string | null } };

const mutations = jest.requireMock('@/features/subscription/api/mutations') as {
  validateAppleTransaction: jest.Mock;
  fetchAppAccountToken: jest.Mock;
  syncSubscription: jest.Mock;
  applyStatus: jest.Mock;
};
const queries = jest.requireMock('@/features/subscription/api/queries') as {
  fetchSubscriptionStatus: jest.Mock;
};

const PRO: SubscriptionStatusDto = {
  tier: 'pro_monthly',
  status: 'ACTIVE',
} as SubscriptionStatusDto;
const JWS = 'a.b.c';

function purchase(productId: string, over: Partial<Purchase> = {}): Purchase {
  return {
    id: `t-${productId}`,
    productId,
    purchaseToken: JWS,
    transactionId: `t-${productId}`,
    transactionDate: 1_000,
    purchaseState: 'purchased',
    isAutoRenewing: true,
    quantity: 1,
    store: 'apple',
    platform: 'ios',
    ...over,
  } as unknown as Purchase;
}

/** The callback expo-iap was handed by `init()`. */
const emitPurchase = (p: Purchase): Promise<void> =>
  (IAP.purchaseUpdatedListener as unknown as jest.Mock).mock.calls[0][0](p);
const emitError = (e: Partial<IAP.ExpoPurchaseError>): void =>
  (IAP.purchaseErrorListener as unknown as jest.Mock).mock.calls[0][0](e);

beforeEach(async () => {
  jest.clearAllMocks();
  _resetStoreServiceForTests();
  queryClient.clear();
  mutations.validateAppleTransaction.mockResolvedValue(PRO);
  mutations.syncSubscription.mockResolvedValue(PRO);
  queries.fetchSubscriptionStatus.mockResolvedValue(PRO);
  (IAP.getPendingTransactionsIOS as unknown as jest.Mock).mockResolvedValue([]);
  (IAP.getAvailablePurchases as unknown as jest.Mock).mockResolvedValue([]);
  (IAP.fetchProducts as unknown as jest.Mock).mockResolvedValue([]);
  (IAP.isUserCancelledError as unknown as jest.Mock).mockReturnValue(false);
  // `jest.clearAllMocks()` only clears calls, not implementations — re-seed everything a test
  // may have overridden so suites cannot leak into each other.
  mutations.fetchAppAccountToken.mockResolvedValue('aaaa-bbbb');
  (IAP.initConnection as unknown as jest.Mock).mockResolvedValue(true);
  (IAP.requestPurchase as unknown as jest.Mock).mockResolvedValue(undefined);
  (IAP.finishTransaction as unknown as jest.Mock).mockResolvedValue(undefined);
  (IAP.syncIOS as unknown as jest.Mock).mockResolvedValue(true);
  (IAP.openRedeemOfferCode as unknown as jest.Mock).mockResolvedValue(null);
  (IAP.isEligibleForIntroOfferIOS as unknown as jest.Mock).mockResolvedValue(false);
  (IAP.purchaseUpdatedListener as unknown as jest.Mock).mockReturnValue({ remove: jest.fn() });
  (IAP.purchaseErrorListener as unknown as jest.Mock).mockReturnValue({ remove: jest.fn() });
  env.androidPackage = 'com.oneplan.app';
});

describe('init / shutdown', () => {
  it('opens the connection once and attaches both listeners', async () => {
    await init();
    await init();
    expect(IAP.initConnection).toHaveBeenCalledTimes(1);
    expect(IAP.purchaseUpdatedListener).toHaveBeenCalledTimes(1);
    expect(IAP.purchaseErrorListener).toHaveBeenCalledTimes(1);
  });

  it('sweeps unfinished transactions on init', async () => {
    (IAP.getPendingTransactionsIOS as unknown as jest.Mock).mockResolvedValue([
      purchase('pro_monthly'),
    ]);
    await init();
    expect(mutations.validateAppleTransaction).toHaveBeenCalledWith(JWS);
    expect(IAP.finishTransaction).toHaveBeenCalledWith({
      purchase: expect.objectContaining({ productId: 'pro_monthly' }),
      isConsumable: false,
    });
    expect(useStore.getState().hasPendingRetry).toBe(false);
  });

  it('retries the connection after a failure', async () => {
    (IAP.initConnection as unknown as jest.Mock).mockRejectedValueOnce(new Error('no store'));
    await expect(init()).resolves.toBeUndefined();
    await init();
    expect(IAP.initConnection).toHaveBeenCalledTimes(2);
  });

  it('closes the connection and removes listeners on shutdown', async () => {
    const remove = jest.fn();
    (IAP.purchaseUpdatedListener as unknown as jest.Mock).mockReturnValue({ remove });
    (IAP.purchaseErrorListener as unknown as jest.Mock).mockReturnValue({ remove });
    await init();
    await shutdown();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(IAP.endConnection).toHaveBeenCalled();
  });
});

describe('reconcilePending', () => {
  it('flags hasPendingRetry when the server refuses an unfinished transaction', async () => {
    (IAP.getPendingTransactionsIOS as unknown as jest.Mock).mockResolvedValue([
      purchase('pro_monthly'),
    ]);
    mutations.validateAppleTransaction.mockRejectedValue(new ApiMutationError(500, {}));
    await reconcilePending();
    expect(IAP.finishTransaction).not.toHaveBeenCalled();
    expect(useStore.getState().hasPendingRetry).toBe(true);
  });

  it('never finishes a transaction still awaiting Ask-to-Buy approval', async () => {
    (IAP.getPendingTransactionsIOS as unknown as jest.Mock).mockResolvedValue([
      purchase('pro_monthly', { purchaseState: 'pending' }),
    ]);
    await reconcilePending();
    expect(mutations.validateAppleTransaction).not.toHaveBeenCalled();
    expect(IAP.finishTransaction).not.toHaveBeenCalled();
  });
});

describe('purchasePro', () => {
  it('sends appAccountToken and resolves once the SERVER accepted the purchase', async () => {
    (IAP.requestPurchase as unknown as jest.Mock).mockImplementation(async () => {
      await emitPurchase(purchase('pro_monthly'));
    });
    await init();
    await expect(purchasePro('pro_monthly')).resolves.toBe('purchased');
    expect(IAP.requestPurchase).toHaveBeenCalledWith({
      type: 'subs',
      request: {
        apple: { sku: 'pro_monthly', appAccountToken: 'aaaa-bbbb' },
        google: { skus: ['pro_monthly'] },
      },
    });
    expect(mutations.applyStatus).toHaveBeenCalledWith(expect.anything(), PRO);
    expect(useStore.getState().purchasing).toBe(false);
  });

  it('resolves "cancelled" when the user dismisses the sheet', async () => {
    (IAP.isUserCancelledError as unknown as jest.Mock).mockReturnValue(true);
    (IAP.requestPurchase as unknown as jest.Mock).mockImplementation(async () => {
      emitError({
        // `ErrorCode.UserCancelled` (types.d.ts:457); the enum itself isn't in the jest mock.
        code: 'user-cancelled' as IAP.ExpoPurchaseError['code'],
        message: 'cancelled',
        productId: 'pro_monthly',
      });
    });
    await init();
    await expect(purchasePro('pro_monthly')).resolves.toBe('cancelled');
    expect(useStore.getState().error).toBeNull();
  });

  it('resolves "pending" for Ask to Buy without finishing the transaction', async () => {
    (IAP.requestPurchase as unknown as jest.Mock).mockImplementation(async () => {
      await emitPurchase(purchase('pro_monthly', { purchaseState: 'pending' }));
    });
    await init();
    await expect(purchasePro('pro_monthly')).resolves.toBe('pending');
    expect(IAP.finishTransaction).not.toHaveBeenCalled();
  });

  it('rejects with the i18n key when the server refuses, and does not finish', async () => {
    mutations.validateAppleTransaction.mockRejectedValue(new ApiMutationError(400, {}));
    (IAP.requestPurchase as unknown as jest.Mock).mockImplementation(async () => {
      await emitPurchase(purchase('pro_monthly'));
    });
    await init();
    await expect(purchasePro('pro_monthly')).rejects.toThrow(
      'Server validation failed. Please try again.',
    );
    expect(IAP.finishTransaction).not.toHaveBeenCalled();
    expect(useStore.getState().error).toEqual({
      key: 'Server validation failed. Please try again.',
    });
    expect(useStore.getState().purchasing).toBe(false);
  });

  it('does not flag hasPendingRetry when a waiter already surfaced the failure', async () => {
    mutations.validateAppleTransaction.mockRejectedValue(new ApiMutationError(400, {}));
    (IAP.requestPurchase as unknown as jest.Mock).mockImplementation(async () => {
      await emitPurchase(purchase('pro_monthly'));
    });
    await init();
    await expect(purchasePro('pro_monthly')).rejects.toThrow();
    expect(useStore.getState().hasPendingRetry).toBe(false);
  });

  it('flags hasPendingRetry for an UNSOLICITED purchase the server refuses (a renewal)', async () => {
    mutations.validateAppleTransaction.mockRejectedValue(new ApiMutationError(500, {}));
    await init();
    await emitPurchase(purchase('pro_yearly'));
    expect(useStore.getState().hasPendingRetry).toBe(true);
    expect(IAP.finishTransaction).not.toHaveBeenCalled();
  });

  it('validates and finishes an unsolicited renewal that the server accepts', async () => {
    await init();
    await emitPurchase(purchase('pro_yearly'));
    expect(IAP.finishTransaction).toHaveBeenCalledWith({
      purchase: expect.objectContaining({ productId: 'pro_yearly' }),
      isConsumable: false,
    });
  });
});

describe('purchaseScanCredits', () => {
  it('buys as an in-app consumable and refreshes the credit balance', async () => {
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    (IAP.requestPurchase as unknown as jest.Mock).mockImplementation(async () => {
      await emitPurchase(purchase('oneplan.video_scan_5'));
    });
    await init();
    await expect(purchaseScanCredits('oneplan.video_scan_5')).resolves.toBe('purchased');
    expect(IAP.requestPurchase).toHaveBeenCalledWith({
      type: 'in-app',
      request: {
        apple: { sku: 'oneplan.video_scan_5' },
        google: { skus: ['oneplan.video_scan_5'] },
      },
    });
    // No appAccountToken on a consumable (constraints.md).
    expect(mutations.fetchAppAccountToken).not.toHaveBeenCalled();
    expect(IAP.finishTransaction).toHaveBeenCalledWith({
      purchase: expect.objectContaining({ productId: 'oneplan.video_scan_5' }),
      isConsumable: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.scanCredits.balance });
  });
});

describe('loadProducts', () => {
  it('fetches subs and one-time products, and stores the subs in paywall order', async () => {
    const sub = (id: string) => ({ id, type: 'subs', platform: 'ios', title: id });
    (IAP.fetchProducts as unknown as jest.Mock)
      .mockResolvedValueOnce([sub('pro_weekly'), sub('pro_yearly'), sub('pro_monthly')])
      .mockResolvedValueOnce([{ id: 'pay_once', type: 'in-app', platform: 'ios' }]);
    const res = await loadProducts();
    expect(IAP.fetchProducts).toHaveBeenNthCalledWith(1, {
      skus: ['pro_yearly', 'pro_monthly', 'pro_weekly'],
      type: 'subs',
    });
    expect(IAP.fetchProducts).toHaveBeenNthCalledWith(2, {
      skus: [
        'oneplan.video_scan_1',
        'oneplan.video_scan_5',
        'oneplan.video_scan_15',
        'oneplan.video_scan_30',
        'pay_once',
      ],
      type: 'in-app',
    });
    expect(res.subs.map((p) => p.id)).toEqual(['pro_yearly', 'pro_monthly', 'pro_weekly']);
    expect(useStore.getState().products.packs).toHaveLength(1);
    expect(useStore.getState().loading).toBe(false);
  });
});

describe('restore (iOS)', () => {
  it('syncs, revalidates the NEWEST pro entitlement, then force-syncs the subscription', async () => {
    (IAP.getAvailablePurchases as unknown as jest.Mock).mockResolvedValue([
      purchase('pro_monthly', { purchaseToken: 'old.j.w', transactionDate: 10 }),
      purchase('pro_yearly', { purchaseToken: 'new.j.w', transactionDate: 99 }),
      purchase('oneplan.video_scan_5', { purchaseToken: 'pack.j.w', transactionDate: 200 }),
    ]);
    await expect(restore()).resolves.toEqual(PRO);
    expect(IAP.syncIOS).toHaveBeenCalled();
    expect(IAP.getAvailablePurchases).toHaveBeenCalledWith({ onlyIncludeActiveItemsIOS: true });
    expect(mutations.validateAppleTransaction).toHaveBeenCalledTimes(1);
    expect(mutations.validateAppleTransaction).toHaveBeenCalledWith('new.j.w');
    expect(mutations.syncSubscription).toHaveBeenCalled();
  });

  it('skips a revoked entitlement', async () => {
    (IAP.getAvailablePurchases as unknown as jest.Mock).mockResolvedValue([
      purchase('pro_monthly', { purchaseToken: 'live.j.w', transactionDate: 10 }),
      purchase('pro_yearly', {
        purchaseToken: 'dead.j.w',
        transactionDate: 99,
        revocationDateIOS: 5,
      }),
    ]);
    await restore();
    expect(mutations.validateAppleTransaction).toHaveBeenCalledWith('live.j.w');
  });

  it('still syncs when there is nothing to revalidate', async () => {
    await restore();
    expect(mutations.validateAppleTransaction).not.toHaveBeenCalled();
    expect(mutations.syncSubscription).toHaveBeenCalled();
  });

  it.each([400, 503])('maps a %s from /subscription/sync to the restore message', async (code) => {
    mutations.syncSubscription.mockRejectedValue(new ApiMutationError(code, {}));
    await expect(restore()).rejects.toThrow(ERR_RESTORE);
    expect(useStore.getState().error).toEqual({ key: ERR_RESTORE });
    expect(useStore.getState().purchasing).toBe(false);
  });

  it('clears hasPendingRetry on success', async () => {
    useStore.getState().setHasPendingRetry(true);
    await restore();
    expect(useStore.getState().hasPendingRetry).toBe(false);
  });

  it('leaves hasPendingRetry set when the restore fails', async () => {
    // `init()` recomputes the flag from the unfinished queue, so set it after the sweep.
    await init();
    useStore.getState().setHasPendingRetry(true);
    mutations.syncSubscription.mockRejectedValue(new ApiMutationError(503, {}));
    await expect(restore()).rejects.toThrow(ERR_RESTORE);
    expect(useStore.getState().hasPendingRetry).toBe(true);
  });
});

describe('manageSubscriptions / isEligibleForFreeTrial', () => {
  it('opens the iOS system sheet and refreshes the entitlement', async () => {
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await manageSubscriptions();
    expect(IAP.showManageSubscriptionsIOS).toHaveBeenCalled();
    expect(IAP.deepLinkToSubscriptions).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.subscription.status });
  });

  it('is never eligible for a free trial while already Pro', async () => {
    queryClient.setQueryData(keys.subscription.status, PRO);
    await expect(isEligibleForFreeTrial()).resolves.toBe(false);
    expect(IAP.isEligibleForIntroOfferIOS).not.toHaveBeenCalled();
  });

  it('defers to StoreKit intro-offer eligibility for a free user', async () => {
    queryClient.setQueryData(keys.subscription.status, { tier: 'free', status: 'NONE' });
    (IAP.fetchProducts as unknown as jest.Mock)
      .mockResolvedValueOnce([
        { id: 'pro_monthly', type: 'subs', platform: 'ios', subscriptionGroupIdIOS: 'grp-1' },
      ])
      .mockResolvedValueOnce([]);
    (IAP.isEligibleForIntroOfferIOS as unknown as jest.Mock).mockResolvedValue(true);
    await expect(isEligibleForFreeTrial()).resolves.toBe(true);
    expect(IAP.isEligibleForIntroOfferIOS).toHaveBeenCalledWith('grp-1');
  });

  it('is not eligible when the catalogue has no pro_monthly product', async () => {
    queryClient.setQueryData(keys.subscription.status, { tier: 'free', status: 'NONE' });
    // `_resetStoreServiceForTests()` (beforeEach) already cleared the cached catalogue.
    (IAP.fetchProducts as unknown as jest.Mock).mockResolvedValue([]);
    await expect(isEligibleForFreeTrial()).resolves.toBe(false);
    expect(IAP.isEligibleForIntroOfferIOS).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* Fix round 1 — lifecycle, dedupe, timeout, error keys, Android        */
/* ------------------------------------------------------------------ */

describe('init — attach-once + isolated sweep', () => {
  it('attaches exactly one listener pair when init is re-entered after a partial failure', async () => {
    await init();
    expect(IAP.purchaseUpdatedListener).toHaveBeenCalledTimes(1);
    // Simulates the old bug shape: `initPromise` cleared while the listeners are still attached.
    _resetStoreServiceForTests({ keepListeners: true });
    await init();
    expect(IAP.purchaseUpdatedListener).toHaveBeenCalledTimes(1);
    expect(IAP.purchaseErrorListener).toHaveBeenCalledTimes(1);
  });

  it('does not half-fail init when the pending sweep query throws', async () => {
    (IAP.getPendingTransactionsIOS as unknown as jest.Mock).mockRejectedValue(new Error('busy'));
    await expect(init()).resolves.toBeUndefined();
    expect(useStore.getState().hasPendingRetry).toBe(true);
    await init();
    expect(IAP.initConnection).toHaveBeenCalledTimes(1);
    expect(IAP.purchaseUpdatedListener).toHaveBeenCalledTimes(1);
  });
});

describe('duplicate delivery', () => {
  it('validates and finishes a transaction ONCE when the listener races the sweep', async () => {
    await init();
    const p = purchase('pro_monthly');
    let release: ((dto: SubscriptionStatusDto) => void) | undefined;
    mutations.validateAppleTransaction.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    (IAP.getPendingTransactionsIOS as unknown as jest.Mock).mockResolvedValue([p]);

    const sweep = reconcilePending();
    await new Promise((r) => setImmediate(r));
    expect(release).toBeDefined();
    const viaListener = emitPurchase(p);
    release?.(PRO);
    await Promise.all([sweep, viaListener]);

    expect(mutations.validateAppleTransaction).toHaveBeenCalledTimes(1);
    expect(IAP.finishTransaction).toHaveBeenCalledTimes(1);
    expect(useStore.getState().hasPendingRetry).toBe(false);
  });

  it('reconcilePending only RAISES hasPendingRetry, never clears it', async () => {
    useStore.getState().setHasPendingRetry(true);
    await reconcilePending();
    expect(useStore.getState().hasPendingRetry).toBe(true);
  });
});

describe('waiter timeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('unlocks the UI as "pending" when the store never answers', async () => {
    await init();
    jest.useFakeTimers();
    (IAP.requestPurchase as unknown as jest.Mock).mockResolvedValue(undefined);
    const outcome = purchasePro('pro_monthly');
    await jest.advanceTimersByTimeAsync(PURCHASE_WAIT_TIMEOUT_MS);
    await expect(outcome).resolves.toBe('pending');
    expect(useStore.getState().purchasing).toBe(false);
    expect(IAP.finishTransaction).not.toHaveBeenCalled();
  });
});

describe('error-key contract', () => {
  it('maps a raw ApiMutationError from fetchAppAccountToken to the interpolated key', async () => {
    mutations.fetchAppAccountToken.mockRejectedValue(new ApiMutationError(500, {}));
    await init();
    await expect(purchasePro('pro_monthly')).rejects.toMatchObject({
      key: ERR_PURCHASE_FAILED,
    });
    // The raw server text is the {{0}} param, never the key.
    expect(useStore.getState().error?.key).toBe(ERR_PURCHASE_FAILED);
    expect(useStore.getState().error?.params?.[0]).toEqual(expect.any(String));
    expect(IAP.requestPurchase).not.toHaveBeenCalled();
  });

  it('loadProducts is best-effort: empty catalogue + error key, never throws', async () => {
    (IAP.fetchProducts as unknown as jest.Mock).mockRejectedValue(new Error('store down'));
    await expect(loadProducts()).resolves.toEqual({ subs: [], packs: [] });
    expect(useStore.getState().error?.key).toBe(ERR_LOAD_PRODUCTS);
    expect(useStore.getState().loading).toBe(false);
  });

  it('a user cancel carries no error and the purchase error carries the native message', async () => {
    (IAP.requestPurchase as unknown as jest.Mock).mockImplementation(async () => {
      emitError({
        code: 'unknown' as IAP.ExpoPurchaseError['code'],
        message: 'billing unavailable',
        productId: 'pro_monthly',
      });
    });
    await init();
    await expect(purchasePro('pro_monthly')).rejects.toMatchObject({ key: ERR_PURCHASE_FAILED });
    expect(useStore.getState().error).toEqual({
      key: ERR_PURCHASE_FAILED,
      params: { 0: 'billing unavailable' },
    });
  });
});

describe('offer codes', () => {
  it('uses openRedeemOfferCode, not the deprecated iOS sheet', async () => {
    await redeemOfferCode();
    expect(IAP.openRedeemOfferCode).toHaveBeenCalled();
    expect(IAP.presentCodeRedemptionSheetIOS).not.toHaveBeenCalled();
    expect(IAP.syncIOS).toHaveBeenCalled();
  });
});

describe('Android', () => {
  const realOS = Platform.OS;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => realOS, configurable: true });
  });

  function androidSub(id: string, offerToken: string | null) {
    return {
      id,
      type: 'subs',
      platform: 'android',
      title: id,
      subscriptionOffers: offerToken
        ? [
            {
              id: 'o1',
              displayPrice: '$1',
              price: 1,
              type: 'introductory',
              offerTokenAndroid: offerToken,
            },
          ]
        : [],
    };
  }

  it('dispatches with the Play offer token and never sends an empty packageName', async () => {
    (IAP.fetchProducts as unknown as jest.Mock)
      .mockResolvedValueOnce([androidSub('pro_monthly', 'tok-1')])
      .mockResolvedValueOnce([]);
    (IAP.requestPurchase as unknown as jest.Mock).mockImplementation(async () => {
      await emitPurchase(purchase('pro_monthly', { store: 'google' }));
    });
    await init();
    await expect(purchasePro('pro_monthly')).resolves.toBe('purchased');
    expect(IAP.requestPurchase).toHaveBeenCalledWith({
      type: 'subs',
      request: {
        apple: { sku: 'pro_monthly', appAccountToken: undefined },
        google: {
          skus: ['pro_monthly'],
          subscriptionOffers: [{ sku: 'pro_monthly', offerToken: 'tok-1' }],
        },
      },
    });
    // No appAccountToken on Android (Play uses obfuscatedAccountId).
    expect(mutations.fetchAppAccountToken).not.toHaveBeenCalled();
  });

  it('refuses to dispatch a subscription with no offer token', async () => {
    (IAP.fetchProducts as unknown as jest.Mock)
      .mockResolvedValueOnce([androidSub('pro_monthly', null)])
      .mockResolvedValueOnce([]);
    await init();
    await expect(purchasePro('pro_monthly')).rejects.toMatchObject({ key: ERR_PURCHASE_FAILED });
    expect(IAP.requestPurchase).not.toHaveBeenCalled();
  });

  it('refuses to dispatch when the android package name is unknown', async () => {
    env.androidPackage = null;
    await init();
    await expect(purchasePro('pro_monthly')).rejects.toMatchObject({ key: ERR_PURCHASE_FAILED });
    expect(IAP.requestPurchase).not.toHaveBeenCalled();
  });

  it('deep-links manage-subscriptions with a SUBSCRIPTION sku, never pay_once', async () => {
    queryClient.setQueryData(keys.subscription.status, { tier: 'pay_once', status: 'ACTIVE' });
    await manageSubscriptions();
    expect(IAP.deepLinkToSubscriptions).toHaveBeenCalledWith({
      skuAndroid: 'pro_monthly',
      packageNameAndroid: 'com.oneplan.app',
    });
  });

  it('deep-links with the active subscription sku when there is one', async () => {
    queryClient.setQueryData(keys.subscription.status, { tier: 'pro_yearly', status: 'ACTIVE' });
    await manageSubscriptions();
    expect(IAP.deepLinkToSubscriptions).toHaveBeenCalledWith({
      skuAndroid: 'pro_yearly',
      packageNameAndroid: 'com.oneplan.app',
    });
  });
});
