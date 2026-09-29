/**
 * `StoreService` — the single owner of the expo-iap connection, listeners and purchase waiters.
 * A module singleton (not a React context) because StoreKit / Play events arrive outside React and
 * must be handled even when no paywall is mounted (renewals, Ask-to-Buy approvals, replayed
 * unfinished transactions). React reads the derived flags through `useStore`.
 *
 * Port of `ios/OnePlan/OnePlan/Services/StoreManager.swift` (purchase :258-310, purchaseScanCredits
 * :320-360, restorePurchases :363-388, processUnfinishedTransactions :169-212,
 * isEligibleForFreeTrial :245-254, reconcileAfterOfferCodeRedemption :394) with the Android
 * verify-then-consume ordering from `ScanCreditPurchaseService.kt:91-102`.
 *
 * Error contract: every rejection is a `StoreError` carrying an **i18n key** plus optional
 * interpolation params; the UI renders `t(err.key, err.params)`. The same `{ key, params }` is
 * mirrored into `useStore().error`. A raw server/native string NEVER reaches `key` — it is passed
 * as the `{{0}}` param of `Purchase failed: %@`. Keys used: `Purchase verification failed`,
 * `Server validation failed. Please try again.`, `Could not verify your purchase with the server.`,
 * `Purchase failed: %@`, `Failed to load subscription status`.
 *
 * expo-iap names used (all verified in node_modules/expo-iap/build):
 *   index.d.ts — `initConnection` :181, `endConnection` :187, `fetchProducts` :211,
 *   `getAvailablePurchases` :231, `requestPurchase` :313, `finishTransaction` :337,
 *   `deepLinkToSubscriptions` :371, `purchaseUpdatedListener` :45, `purchaseErrorListener` :48,
 *   `isUserCancelledError` :432.
 *   `openRedeemOfferCode` :384 (replaces the deprecated `presentCodeRedemptionSheetIOS`).
 *   modules/ios.d.ts — `syncIOS` :23, `isEligibleForIntroOfferIOS` :35,
 *   `showManageSubscriptionsIOS` :95, `getPendingTransactionsIOS` :205.
 */
import * as IAP from 'expo-iap';
import type { Product, ProductSubscription, Purchase, RequestPurchaseProps } from 'expo-iap';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { keys } from '@/api/keys';
import { queryClient } from '@/api/queryClient';
import { useAuthStore } from '@/auth/authStore';
import { registerSignOutHook } from '@/auth/signOutHooks';
import { isProSku, isProTier } from '@/features/subscription/entitlement';
import {
  applyStatus,
  fetchAppAccountToken,
  syncSubscription,
  validateAppleTransaction,
  verifyPlayPurchase,
} from '@/features/subscription/api/mutations';
import { fetchSubscriptionStatus } from '@/features/subscription/api/queries';
import {
  PAY_ONCE_SKU,
  PRO_SUB_SKUS,
  SCAN_PACK_SKUS,
  type SubscriptionStatusDto,
} from '@/features/subscription/types';
import { env } from '@/lib/env';

import { androidOfferToken, hasFreeTrialOfferAndroid, sortByPaywallOrder } from './products';
import {
  ERR_RESTORE,
  ERR_SERVER_VALIDATION,
  handlePurchase,
  StoreError,
  type PurchaseDeps,
  type PurchaseKind,
  type StoreErrorInfo,
} from './purchaseFlow';
import { iapStore, type StoreProducts } from './useStore';

/** i18n key used when the store itself rejects the request (not the server). Takes a `{{0}}` param. */
export const ERR_PURCHASE_FAILED = 'Purchase failed: %@';
/** i18n key used when the store could not return its catalogue. */
export const ERR_LOAD_PRODUCTS = 'Failed to load subscription status';

/**
 * How long a dispatched purchase may stay unanswered before the UI is unlocked. StoreKit / Play
 * normally answer in seconds, but a wedged payment sheet would otherwise latch `purchasing: true`
 * forever with no way back. On timeout the waiter resolves `'pending'` — the purchase, if it ever
 * completes, is picked up by the next `init()` sweep or a manual Restore.
 */
export const PURCHASE_WAIT_TIMEOUT_MS = 5 * 60_000;

/**
 * `'pending'` is iOS Ask-to-Buy / a deferred Play purchase: the transaction is NOT finished and
 * will arrive again through the purchase listener once approved.
 */
export type PurchaseOutcome = 'purchased' | 'cancelled' | 'pending';

type Waiter = {
  resolve: (outcome: PurchaseOutcome) => void;
  reject: (err: Error) => void;
};

const waiters = new Map<string, Waiter>();
/**
 * Transactions currently being validated, keyed by transaction identity. iOS replays unfinished
 * transactions through `purchaseUpdatedListener` at the same time as the manual `reconcilePending`
 * sweep reads them, so without this the same purchase is validated twice and the second
 * `finishTransaction` throws — surfacing a bogus error + `hasPendingRetry`.
 */
const inFlight = new Set<string>();
let subscriptions: { remove: () => void }[] = [];
let initPromise: Promise<void> | null = null;

const platform = (): 'ios' | 'android' => (Platform.OS === 'ios' ? 'ios' : 'android');

/** Throws rather than sending `packageName: ''`, which Play verification would silently reject. */
function androidPackageName(): string {
  const pkg = env.androidPackage;
  if (!pkg) {
    throw new StoreError({
      key: ERR_PURCHASE_FAILED,
      params: { 0: 'missing Android package name' },
    });
  }
  return pkg;
}

function deps(): PurchaseDeps {
  const isAndroid = platform() === 'android';
  return {
    validateApple: (jws) => validateAppleTransaction(jws),
    verifyPlay: (body) => verifyPlayPurchase(body),
    finish: async (purchase, isConsumable) => {
      await IAP.finishTransaction({ purchase, isConsumable });
    },
    platform: platform(),
    packageName: isAndroid ? androidPackageName() : '',
  };
}

/** Normalises anything thrown into the `{ key, params }` contract. */
function errorInfo(err: unknown): StoreErrorInfo {
  if (err instanceof StoreError) return err.info;
  return { key: ERR_SERVER_VALIDATION };
}

/** Wraps a non-`StoreError` (native/API) failure into the interpolated "Purchase failed" key. */
function purchaseFailed(detail: unknown): StoreError {
  if (detail instanceof StoreError) return detail;
  const text = detail instanceof Error ? detail.message : String(detail);
  return new StoreError({ key: ERR_PURCHASE_FAILED, params: { 0: text } }, { cause: detail });
}

/** Stable identity for a transaction across the listener and the sweep. */
function transactionKey(purchase: Purchase): string {
  return (
    purchase.id || purchase.transactionId || `${purchase.productId}:${purchase.transactionDate}`
  );
}

/**
 * `handlePurchase` guarded against concurrent duplicate delivery. Returns `null` when the same
 * transaction is already being processed by the other entry point.
 */
async function processPurchase(
  purchase: Purchase,
  d: PurchaseDeps,
): Promise<{ status: SubscriptionStatusDto; kind: PurchaseKind } | null> {
  const id = transactionKey(purchase);
  if (inFlight.has(id)) return null;
  inFlight.add(id);
  try {
    return await handlePurchase(purchase, d);
  } finally {
    inFlight.delete(id);
  }
}

/* ------------------------------------------------------------------ */
/* Waiters — a purchase resolves only after the SERVER accepted it     */
/* ------------------------------------------------------------------ */

function waitFor(productId: string): Promise<PurchaseOutcome> {
  return new Promise<PurchaseOutcome>((resolve, reject) => {
    // A second attempt for the same SKU supersedes the first; settle the old promise so no caller
    // is left hanging on a flow the user restarted.
    waiters.get(productId)?.resolve('cancelled');
    waiters.set(productId, { resolve, reject });
  });
}

function settleWaiter(productId: string, settle: (w: Waiter) => void): boolean {
  const waiter = waiters.get(productId);
  if (!waiter) return false;
  waiters.delete(productId);
  settle(waiter);
  return true;
}

/* ------------------------------------------------------------------ */
/* Listeners                                                           */
/* ------------------------------------------------------------------ */

async function onPurchaseUpdated(purchase: Purchase): Promise<void> {
  // Ask to Buy / deferred: do NOT finish and do NOT validate — there is nothing to validate yet.
  if (purchase.purchaseState === 'pending') {
    settleWaiter(purchase.productId, (w) => w.resolve('pending'));
    return;
  }
  try {
    const result = await processPurchase(purchase, deps());
    // The cold-start sweep is already validating this exact transaction; it owns the outcome.
    // Any waiter is released by the timeout in `runPurchase` (this can only race a purchase the
    // user did NOT just initiate, i.e. one replayed from a previous session).
    if (!result) return;
    applyStatus(queryClient, result.status);
    afterFinish(result.kind);
    // Solicited or not (a renewal replayed by StoreKit resolves no waiter), the purchase is done.
    settleWaiter(purchase.productId, (w) => w.resolve('purchased'));
  } catch (err) {
    const info = errorInfo(err);
    iapStore.setError(info);
    const claimed = settleWaiter(purchase.productId, (w) =>
      w.reject(err instanceof StoreError ? err : new StoreError(info, { cause: err })),
    );
    // Nobody is waiting: this was a background/replayed transaction that the server refused. Keep
    // it unfinished and let the UI offer a manual Restore (StoreManager.swift:169-176).
    if (!claimed) iapStore.setHasPendingRetry(true);
  }
}

function onPurchaseError(error: IAP.ExpoPurchaseError): void {
  const cancelled = IAP.isUserCancelledError(error);
  const productIds = [error.productId, ...(error.productIds ?? [])].filter((id): id is string =>
    Boolean(id),
  );
  // No product id on the error (Android often omits it) — fail every in-flight waiter.
  const targets = productIds.length > 0 ? productIds : [...waiters.keys()];
  const info: StoreErrorInfo = { key: ERR_PURCHASE_FAILED, params: { 0: error.message } };
  for (const id of targets) {
    settleWaiter(id, (w) =>
      cancelled ? w.resolve('cancelled') : w.reject(new StoreError(info, { cause: error })),
    );
  }
  if (!cancelled) iapStore.setError(info);
}

/** Refreshes whatever the finished purchase invalidated. */
function afterFinish(kind: PurchaseKind): void {
  if (kind === 'scan_pack') {
    // Mirrors iOS `.scanCreditBalanceChanged` (StoreManager.swift:352-354).
    void queryClient.invalidateQueries({ queryKey: keys.scanCredits.balance });
  }
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

/**
 * Opens the store connection, attaches the listeners and sweeps unfinished transactions. Safe to
 * call repeatedly: the first call's promise is reused. Never rejects — a store that is unreachable
 * must not break the app shell; the next call retries.
 */
export async function init(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await IAP.initConnection();
    // Attach ONCE. `init()` can be re-entered after a failed attempt (the `.catch` below clears
    // the memoised promise); pushing a second pair would make every purchase be handled twice.
    if (subscriptions.length === 0) {
      // The async handler is passed directly: expo-iap types the listener as `(event) => void` and
      // ignores the returned promise, but keeping it lets tests await the full validate→finish pass.
      subscriptions.push(IAP.purchaseUpdatedListener(onPurchaseUpdated));
      subscriptions.push(IAP.purchaseErrorListener(onPurchaseError));
    }
    try {
      await reconcilePending();
    } catch {
      // The sweep is best-effort: a failed query must not half-fail `init()` (listeners attached,
      // connection open, but `initPromise` cleared). Surface it as a Restore CTA instead.
      iapStore.setHasPendingRetry(true);
    }
  })().catch(() => {
    // Allow a later call (e.g. opening the paywall) to retry the connection.
    initPromise = null;
  });
  return initPromise;
}

/** Closes the connection and detaches listeners. Called when `SessionEffects` unmounts. */
export async function shutdown(): Promise<void> {
  for (const sub of subscriptions) sub.remove();
  subscriptions = [];
  for (const [id] of waiters) settleWaiter(id, (w) => w.resolve('cancelled'));
  inFlight.clear();
  initPromise = null;
  try {
    await IAP.endConnection();
  } catch {
    // Already closed — nothing to do.
  }
}

/**
 * Replays interrupted purchases (app killed mid-purchase, Ask-to-Buy approved while closed,
 * Android purchases not yet acknowledged). A failure RAISES `hasPendingRetry` so the UI can offer a
 * manual Restore; it never clears it — only a successful `restore()` does, so a failure recorded by
 * the purchase listener survives the next cold-start sweep.
 */
export async function reconcilePending(): Promise<void> {
  const d = deps();
  let pending: Purchase[];
  if (d.platform === 'ios') {
    pending = (await IAP.getPendingTransactionsIOS()) ?? [];
  } else {
    const available = (await IAP.getAvailablePurchases()) ?? [];
    pending = available.filter(
      (p) =>
        p.purchaseState === 'purchased' &&
        !('isAcknowledgedAndroid' in p && p.isAcknowledgedAndroid),
    );
  }
  let failureSeen = false;
  for (const purchase of pending) {
    // Still awaiting approval — not ours to finish.
    if (purchase.purchaseState === 'pending') continue;
    try {
      const result = await processPurchase(purchase, d);
      // Already being handled by the purchase listener — not a failure.
      if (!result) continue;
      applyStatus(queryClient, result.status);
      afterFinish(result.kind);
    } catch {
      failureSeen = true;
    }
  }
  if (failureSeen) iapStore.setHasPendingRetry(true);
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

/**
 * Fetches the Pro subscriptions and the one-time products (scan packs + `pay_once`).
 *
 * **Best-effort — never throws** (mirrors iOS `loadScanPackProducts`, StoreManager.swift:82-91):
 * a store outage sets `useStore().error` and returns an EMPTY catalogue so the paywall can render
 * its empty state. Callers that need a product must handle `undefined` (see `purchasePro`).
 */
export async function loadProducts(): Promise<StoreProducts> {
  await init();
  iapStore.setLoading(true);
  try {
    const fetchedSubs = await IAP.fetchProducts({ skus: [...PRO_SUB_SKUS], type: 'subs' });
    const fetchedPacks = await IAP.fetchProducts({
      skus: [...SCAN_PACK_SKUS, PAY_ONCE_SKU],
      type: 'in-app',
    });
    const products: StoreProducts = {
      subs: sortByPaywallOrder((fetchedSubs ?? []) as ProductSubscription[]),
      packs: (fetchedPacks ?? []) as Product[],
    };
    iapStore.setProducts(products);
    return products;
  } catch {
    // `ERR_LOAD_PRODUCTS` has no `{{0}}` placeholder, so passing the cause as a param would be
    // dead weight (and silently dropped by i18next).
    iapStore.setError({ key: ERR_LOAD_PRODUCTS });
    return { subs: [], packs: [] };
  } finally {
    iapStore.setLoading(false);
  }
}

/** Cached products, fetching them once if the paywall hasn't already. */
async function ensureProducts(): Promise<StoreProducts> {
  const cached = iapStore.get().products;
  if (cached.subs.length > 0 || cached.packs.length > 0) return cached;
  return loadProducts();
}

/* ------------------------------------------------------------------ */
/* Purchase                                                            */
/* ------------------------------------------------------------------ */

async function runPurchase(
  sku: string,
  build: () => Promise<RequestPurchaseProps>,
): Promise<PurchaseOutcome> {
  await init();
  iapStore.setPurchasing(true);
  iapStore.setError(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let request: RequestPurchaseProps;
    try {
      // `build()` can hit the network (`fetchAppAccountToken`) — an `ApiMutationError`'s message is
      // raw server text, so it must become the `{{0}}` param, never the i18n key.
      request = await build();
    } catch (err) {
      throw purchaseFailed(err);
    }
    // Register the waiter BEFORE dispatching: `requestPurchase` is event-based and the listener
    // can fire before it resolves (index.d.ts:288-313).
    const settled = waitFor(sku);
    const timedOut = new Promise<PurchaseOutcome>((resolve) => {
      timer = setTimeout(() => {
        // Drop the orphaned waiter and unlock the UI. Treated as deferred, not failed: the store
        // may still complete the purchase, and the next sweep/restore reconciles it.
        settleWaiter(sku, () => undefined);
        resolve('pending');
      }, PURCHASE_WAIT_TIMEOUT_MS);
    });
    try {
      await IAP.requestPurchase(request);
    } catch (err) {
      settleWaiter(sku, (w) => w.reject(purchaseFailed(err)));
    }
    return await Promise.race([settled, timedOut]);
  } catch (err) {
    iapStore.setError(errorInfo(err));
    throw err;
  } finally {
    clearTimeout(timer);
    iapStore.setPurchasing(false);
  }
}

/**
 * Buys an auto-renewing Pro plan. Resolves only once the SERVER has accepted the transaction (the
 * purchase listener does the validate-then-finish), so a `'purchased'` result means the
 * entitlement cache already holds the new tier.
 */
export async function purchasePro(sku: string): Promise<PurchaseOutcome> {
  return runPurchase(sku, async () => {
    // `appAccountToken` is only valid for auto-renewables (constraints.md); Play uses
    // obfuscatedAccountId, which the server does not require.
    const appAccountToken = platform() === 'ios' ? await fetchAppAccountToken() : undefined;
    if (platform() !== 'android') {
      return {
        type: 'subs',
        request: { apple: { sku, appAccountToken }, google: { skus: [sku] } },
      };
    }
    // Play REQUIRES an offerToken for a subscription; dispatching without one either fails
    // opaquely or buys the wrong base plan. `androidPackageName()` throws early for the same reason.
    androidPackageName();
    const offerToken = androidOfferToken(
      (await ensureProducts()).subs.find((p) => p.id === sku),
      sku,
    );
    if (!offerToken) {
      throw new StoreError({
        key: ERR_PURCHASE_FAILED,
        params: { 0: `missing offer token for ${sku}` },
      });
    }
    return {
      type: 'subs',
      request: {
        apple: { sku, appAccountToken },
        google: { skus: [sku], subscriptionOffers: [{ sku, offerToken }] },
      },
    };
  });
}

/**
 * Buys a consumable scan-credit pack. No `appAccountToken` (non-renewable), and the pack is only
 * consumed after the server accepted it — the balance query is invalidated from the listener.
 */
export async function purchaseScanCredits(sku: string): Promise<PurchaseOutcome> {
  return runPurchase(sku, async () => ({
    type: 'in-app',
    request: { apple: { sku }, google: { skus: [sku] } },
  }));
}

/* ------------------------------------------------------------------ */
/* Restore / sync                                                      */
/* ------------------------------------------------------------------ */

/** Newest non-revoked Pro purchase, by `transactionDate` (StoreManager.swift:416-431). */
function newestProPurchase(purchases: Purchase[]): Purchase | undefined {
  return purchases
    .filter((p) => isProSku(p.productId))
    .filter((p) => !('revocationDateIOS' in p && p.revocationDateIOS != null))
    .sort((a, b) => b.transactionDate - a.transactionDate)[0];
}

/**
 * Re-validates the current entitlement against the server so refunds/revocations issued after the
 * JWS was cached take effect, then force-syncs the linked subscription. A successful restore
 * clears `hasPendingRetry`.
 */
export async function restore(): Promise<SubscriptionStatusDto> {
  await init();
  iapStore.setPurchasing(true);
  iapStore.setError(null);
  try {
    const status = platform() === 'ios' ? await restoreIOS() : await restoreAndroid();
    applyStatus(queryClient, status);
    iapStore.setHasPendingRetry(false);
    return status;
  } catch (err) {
    iapStore.setError(errorInfo(err));
    throw err;
  } finally {
    iapStore.setPurchasing(false);
  }
}

async function restoreIOS(): Promise<SubscriptionStatusDto> {
  await IAP.syncIOS();
  const purchases = (await IAP.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })) ?? [];
  const latest = newestProPurchase(purchases);
  try {
    if (latest?.purchaseToken) await validateAppleTransaction(latest.purchaseToken);
    // `/subscription/sync` answers 400 (nothing linked) / 503 (Apple unavailable) — both are a
    // failed restore from the user's point of view (StoreManager.swift:378-383).
    return await syncSubscription();
  } catch (err) {
    // Includes `/subscription/sync`'s 400 (nothing linked) and 503 (Apple unavailable).
    throw new StoreError({ key: ERR_RESTORE }, { cause: err });
  }
}

async function restoreAndroid(): Promise<SubscriptionStatusDto> {
  const purchases = (await IAP.getAvailablePurchases()) ?? [];
  let latest: SubscriptionStatusDto | null = null;
  let failureSeen = false;
  for (const purchase of purchases) {
    if (purchase.purchaseState === 'pending') continue;
    try {
      const result = await processPurchase(purchase, deps());
      if (!result) continue;
      afterFinish(result.kind);
      latest = result.status;
    } catch {
      failureSeen = true;
    }
  }
  if (failureSeen) {
    iapStore.setHasPendingRetry(true);
    throw new StoreError({ key: ERR_RESTORE });
  }
  return latest ?? (await fetchSubscriptionStatus());
}

/* ------------------------------------------------------------------ */
/* Offer codes / manage / free trial                                   */
/* ------------------------------------------------------------------ */

/**
 * Presents the platform offer-code redemption flow. Redemptions complete asynchronously through
 * the purchase listener, so give the store a beat and then reconcile (StoreManager.swift:394-400).
 * Uses `openRedeemOfferCode` (index.d.ts:384) — `presentCodeRedemptionSheetIOS` is `@deprecated`
 * in expo-iap 5.6.0 (modules/ios.d.ts:161-162) and slated for removal in OpenIAP 4.0.
 * Android has no in-app sheet — the flow is a Play Store deep link, out of scope here.
 */
export async function redeemOfferCode(): Promise<void> {
  if (platform() !== 'ios') return;
  await init();
  await IAP.openRedeemOfferCode();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await restore();
}

/** Opens the system subscription management UI, then refreshes the entitlement. */
export async function manageSubscriptions(): Promise<void> {
  await init();
  try {
    if (platform() === 'ios') {
      await IAP.showManageSubscriptionsIOS();
    } else {
      const tier = queryClient.getQueryData<SubscriptionStatusDto>(keys.subscription.status)?.tier;
      // Play's subscription centre only accepts a SUBSCRIPTION sku — `pay_once` (non-consumable)
      // and `free` must fall back, or the deep link lands on an error page.
      const isSubTier = (PRO_SUB_SKUS as readonly string[]).includes(tier ?? '');
      await IAP.deepLinkToSubscriptions({
        skuAndroid: isSubTier ? tier : PRO_SUB_SKUS[1],
        packageNameAndroid: androidPackageName(),
      });
    }
  } finally {
    void queryClient.invalidateQueries({ queryKey: keys.subscription.status });
  }
}

/**
 * Whether to surface the free-trial promo. False for anyone already Pro; otherwise defers to the
 * store's own eligibility — StoreKit's introductory-offer check on iOS, a zero-priced first
 * pricing phase on Play (StoreManager.swift:245-254).
 */
export async function isEligibleForFreeTrial(): Promise<boolean> {
  const status = queryClient.getQueryData<SubscriptionStatusDto>(keys.subscription.status);
  if (isProTier(status)) return false;
  await init();
  const monthly = (await ensureProducts()).subs.find((p) => p.id === 'pro_monthly');
  // No catalogue at all (store unreachable, SKU not configured) → never promote the trial.
  // iOS does the same: `StoreManager.isEligibleForFreeTrial` returns false without a product
  // (`StoreManager.swift:245-254`).
  if (!monthly) return false;
  if (platform() === 'android') return hasFreeTrialOfferAndroid(monthly);
  try {
    // StoreKit checks eligibility per subscription GROUP; fall back to the SKU when the store did
    // not expose the group id (ProductSubscriptionIOS.subscriptionGroupIdIOS, types.d.ts:1078).
    const groupId =
      'subscriptionGroupIdIOS' in monthly
        ? (monthly.subscriptionGroupIdIOS ?? 'pro_monthly')
        : 'pro_monthly';
    return Boolean(await IAP.isEligibleForIntroOfferIOS(groupId));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* React / sign-out wiring                                             */
/* ------------------------------------------------------------------ */

/** Opens the store connection while a session is active; closes it on unmount. */
export function useStoreInit(): void {
  const authed = useAuthStore((s) => s.status === 'authed');
  useEffect(() => {
    if (!authed) return;
    void init();
    return () => {
      void shutdown();
    };
  }, [authed]);
}

let signOutHookInstalled = false;

/**
 * Drops cached products / flags on sign-out. The *connection* is deliberately left open: it is
 * device-scoped, not account-scoped, and the next user's paywall needs it.
 */
export function installStoreSignOutHook(): void {
  if (signOutHookInstalled) return;
  signOutHookInstalled = true;
  registerSignOutHook(async () => {
    iapStore.reset();
  });
}

/**
 * Test-only: clears listeners, waiters and the memoised connection promise.
 * `keepListeners` simulates a re-entered `init()` after a partial failure, so the
 * attach-once guard can be exercised.
 */
export function _resetStoreServiceForTests({ keepListeners = false } = {}): void {
  if (!keepListeners) subscriptions = [];
  waiters.clear();
  inFlight.clear();
  initPromise = null;
  signOutHookInstalled = false;
  iapStore.reset();
}
