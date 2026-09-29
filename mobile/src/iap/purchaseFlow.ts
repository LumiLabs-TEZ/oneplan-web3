/**
 * The purchase state machine, as a pure async function over injected dependencies so the ORDER of
 * operations is unit-testable without expo-iap or a device.
 *
 * The load-bearing rule (constraints.md; StoreManager.swift:280-292,
 * ScanCreditPurchaseService.kt:91-102): **never finish/consume a transaction before the server has
 * accepted it**. If validation throws, the transaction is left unfinished so the store replays it
 * (iOS `Transaction.unfinished`, Android `getAvailablePurchases`) and the user can retry — the
 * alternative silently forfeits a paid purchase.
 *
 * Errors are thrown as `StoreError`, which carries an i18n `key` (+ optional interpolation
 * `params`); the UI renders `t(err.key, err.params)`. `message` is the key too, so
 * `expect(...).toThrow(KEY)` and a bare `console.warn(err)` still read sensibly. The originating
 * error is attached as `cause` so callers can still read an `ApiMutationError.status`.
 */
import type { Purchase } from 'expo-iap';

import type { components } from '@/api/schema';
import { isScanPackSku } from '@/features/subscription/entitlement';
import { PAY_ONCE_SKU, type SubscriptionStatusDto } from '@/features/subscription/types';

type VerifyPlayPurchaseDto = components['schemas']['VerifyPlayPurchaseDto'];

/** i18n key: the store handed us a purchase we can't send to the server. */
export const ERR_VERIFICATION = 'Purchase verification failed';
/** i18n key: the server rejected the purchase; nothing was finished. */
export const ERR_SERVER_VALIDATION = 'Server validation failed. Please try again.';
/** i18n key: restore/sync could not be confirmed by the server (StoreManager.swift:381). */
export const ERR_RESTORE = 'Could not verify your purchase with the server.';

/** An i18n key plus its interpolation params — the only error shape this layer produces. */
export type StoreErrorInfo = { key: string; params?: Record<string, unknown> };

/**
 * Error whose `key` is an i18n key from `src/i18n/locales/en.json`. Never put a server/native
 * string in `key`: raw text would be rendered as a missing translation.
 */
export class StoreError extends Error {
  readonly key: string;
  readonly params?: Record<string, unknown>;

  constructor(info: StoreErrorInfo, options?: { cause?: unknown }) {
    super(info.key, options);
    this.name = 'StoreError';
    this.key = info.key;
    this.params = info.params;
  }

  get info(): StoreErrorInfo {
    return { key: this.key, params: this.params };
  }
}

export type PurchaseKind = 'sub' | 'pay_once' | 'scan_pack';

export type PurchaseDeps = {
  validateApple(jws: string): Promise<SubscriptionStatusDto>;
  verifyPlay(body: VerifyPlayPurchaseDto): Promise<SubscriptionStatusDto>;
  finish(purchase: Purchase, isConsumable: boolean): Promise<void>;
  platform: 'ios' | 'android';
  packageName: string;
};

/**
 * Consumable pack vs non-consumable lifetime vs auto-renewing sub. Unknown SKUs are treated as
 * subscriptions: the server is authoritative, and a non-consumable finish is the safe default
 * (consuming something that wasn't a pack would let it be re-bought for free).
 */
export function purchaseKind(productId: string): PurchaseKind {
  if (isScanPackSku(productId)) return 'scan_pack';
  if (productId === PAY_ONCE_SKU) return 'pay_once';
  return 'sub';
}

function wrapServerError(err: unknown): StoreError {
  return new StoreError({ key: ERR_SERVER_VALIDATION }, { cause: err });
}

/**
 * Validate-then-finish. Returns the server's fresh `SubscriptionStatusDto` plus the SKU kind so
 * the caller knows whether to refresh the scan-credit balance.
 */
export async function handlePurchase(
  purchase: Purchase,
  deps: PurchaseDeps,
): Promise<{ status: SubscriptionStatusDto; kind: PurchaseKind }> {
  const kind = purchaseKind(purchase.productId);
  const isConsumable = kind === 'scan_pack';
  // `purchaseToken` is the unified token: iOS JWS, Android purchaseToken (types.d.ts:1172-1173).
  const token = purchase.purchaseToken;
  let status: SubscriptionStatusDto;

  if (deps.platform === 'ios') {
    // A StoreKit 2 JWS is `header.payload.signature`; anything else means StoreKit handed us an
    // unverified transaction — fail before burning a network round-trip.
    if (!token || token.split('.').length !== 3) throw new StoreError({ key: ERR_VERIFICATION });
    try {
      status = await deps.validateApple(token);
    } catch (err) {
      throw wrapServerError(err);
    }
  } else {
    if (!token) throw new StoreError({ key: ERR_VERIFICATION });
    try {
      status = await deps.verifyPlay({
        packageName: deps.packageName,
        productId: purchase.productId,
        purchaseToken: token,
        orderId: purchase.transactionId ?? undefined,
        purchaseTimeMillis: String(purchase.transactionDate),
        // 0 = PURCHASED in Play's `Purchase.PurchaseState`; we only reach here for purchased items.
        purchaseState: 0,
      });
    } catch (err) {
      throw wrapServerError(err);
    }
  }

  // Server accepted — only now is it safe to consume/acknowledge. On Android the server already
  // acknowledged subscriptions; `finishTransaction` with `isConsumable: false` is then a no-op.
  await deps.finish(purchase, isConsumable);
  return { status, kind };
}
