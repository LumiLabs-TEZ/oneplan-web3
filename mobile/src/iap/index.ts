/**
 * Public surface of the IAP layer. Screens import from `@/iap` only — never from `expo-iap`
 * directly, so the validate-before-finish ordering can never be bypassed.
 */
export * as StoreService from './StoreService';
export {
  ERR_LOAD_PRODUCTS,
  ERR_PURCHASE_FAILED,
  installStoreSignOutHook,
  isEligibleForFreeTrial,
  loadProducts,
  manageSubscriptions,
  purchasePro,
  purchaseScanCredits,
  PURCHASE_WAIT_TIMEOUT_MS,
  redeemOfferCode,
  restore,
  useStoreInit,
  type PurchaseOutcome,
} from './StoreService';
export {
  ERR_RESTORE,
  ERR_SERVER_VALIDATION,
  ERR_VERIFICATION,
  handlePurchase,
  purchaseKind,
  StoreError,
  type PurchaseDeps,
  type PurchaseKind,
  type StoreErrorInfo,
} from './purchaseFlow';
export {
  androidOfferToken,
  dailyPriceLabel,
  defaultSelection,
  hasFreeTrialOfferAndroid,
  isoPeriodDays,
  normalizedPeriod,
  periodWeight,
  sortByPaywallOrder,
  videoQuotaLabel,
  type Translate,
} from './products';
export { useStore, type StoreProducts } from './useStore';
