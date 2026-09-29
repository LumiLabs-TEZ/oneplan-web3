/**
 * Client-side IAP state for the paywall and the buy-credits sheet. Server state (the entitlement)
 * lives in TanStack Query under `keys.subscription.status` — this slice only holds what StoreKit /
 * Play tell us: the fetched products and the in-flight/last-error flags.
 *
 * Deliberately not persisted: prices are locale + storefront dependent and must be re-fetched.
 */
import { create } from 'zustand';

import type { Product, ProductSubscription } from 'expo-iap';

import type { StoreErrorInfo } from './purchaseFlow';

export interface StoreProducts {
  /** Auto-renewing Pro plans, already in paywall order. */
  subs: ProductSubscription[];
  /** Consumable scan packs + the non-consumable `pay_once`. */
  packs: Product[];
}

interface IapStoreState {
  products: StoreProducts;
  /** True while `loadProducts()` is in flight. */
  loading: boolean;
  /** True while a purchase / restore is in flight. */
  purchasing: boolean;
  /**
   * True when at least one unfinished transaction failed server validation. The UI surfaces a
   * "we couldn't verify your last purchase — tap Restore" CTA (StoreManager.swift:169-176).
   */
  hasPendingRetry: boolean;
  /** i18n key + params of the last failure (the UI calls `t(error.key, error.params)`), or `null`. */
  error: StoreErrorInfo | null;
  setProducts: (products: StoreProducts) => void;
  setLoading: (loading: boolean) => void;
  setPurchasing: (purchasing: boolean) => void;
  setHasPendingRetry: (hasPendingRetry: boolean) => void;
  setError: (error: StoreErrorInfo | null) => void;
  reset: () => void;
}

const INITIAL = {
  products: { subs: [], packs: [] } as StoreProducts,
  loading: false,
  purchasing: false,
  hasPendingRetry: false,
  error: null as StoreErrorInfo | null,
};

export const useStore = create<IapStoreState>()((set) => ({
  ...INITIAL,
  setProducts: (products) => set({ products }),
  setLoading: (loading) => set({ loading }),
  setPurchasing: (purchasing) => set({ purchasing }),
  setHasPendingRetry: (hasPendingRetry) => set({ hasPendingRetry }),
  setError: (error) => set({ error }),
  reset: () => set(INITIAL),
}));

/** Non-hook access — `StoreService` lives outside React. */
export const iapStore = {
  get: () => useStore.getState(),
  setProducts: (products: StoreProducts) => useStore.getState().setProducts(products),
  setLoading: (loading: boolean) => useStore.getState().setLoading(loading),
  setPurchasing: (purchasing: boolean) => useStore.getState().setPurchasing(purchasing),
  setHasPendingRetry: (v: boolean) => useStore.getState().setHasPendingRetry(v),
  setError: (error: StoreErrorInfo | null) => useStore.getState().setError(error),
  reset: () => useStore.getState().reset(),
};
