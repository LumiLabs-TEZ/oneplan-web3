/**
 * Screen state for the paywall — port of `PaywallView`'s `.task` product load
 * (SubscriptionView.swift:200-229), purchase-close rule (:104-130), restore (:259-282), and offer
 * code flow (:147-163, :364-390). Loads products on mount, defaults the selection to "Best value",
 * and exposes the primary CTA plus restore/promo actions. Purchase/restore progress and the last
 * store error live in `useStore()` (the client-side IAP slice); the server-authoritative tier comes
 * from `useSubscriptionStatus()`.
 */
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { keys } from '@/api/keys';
import { track } from '@/analytics/track';
import { isProTier } from '@/features/subscription/entitlement';
import { PRO_SUB_SKUS, type SubscriptionStatusDto } from '@/features/subscription/types';
import { useAppLanguage } from '@/i18n';
import { defaultSelection, StoreError, StoreService, type StoreProducts, useStore } from '@/iap';

import { primaryAction as computePrimaryAction, type PrimaryAction } from './helpers/paywall';
import { useCurrentTier, useIsPro, useSubscriptionStatus } from './api/queries';

export interface UsePaywallResult {
  loading: boolean;
  purchasing: boolean;
  hasPendingRetry: boolean;
  subs: StoreProducts['subs'];
  packs: StoreProducts['packs'];
  selectedSku: string | null;
  selectSku: (sku: string) => void;
  primaryAction: PrimaryAction;
  onPrimary: () => Promise<void>;
  onClose: () => void;
  onRestore: () => Promise<void>;
  onPromo: () => Promise<void>;
  awaitingPromo: boolean;
  /** `/subscription/status` errored and there's no cached tier to fall back on — the screen
   * shows `t('Failed to load subscription status')` and disables the primary CTA. */
  statusUnavailable: boolean;
}

function isSubSku(sku: string | null): boolean {
  return sku != null && (PRO_SUB_SKUS as readonly string[]).includes(sku);
}

export function usePaywall(): UsePaywallResult {
  useAppLanguage();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { products, loading, purchasing, hasPendingRetry } = useStore();
  const isPro = useIsPro();
  const currentTier = useCurrentTier();
  const status = useSubscriptionStatus();
  const statusUnavailable = status.isError && status.data === undefined;

  // `userSku` is only set once the user actually taps a card; until then the effective selection
  // is derived every render from the freshest product list ("adjust state while rendering" —
  // https://react.dev/learn/you-might-not-need-an-effect — avoids an effect+setState cascade for
  // what is really a render-time default, and keeps the "Best value" pick in sync if products
  // reload with a different catalogue before the user has chosen).
  const [userSku, setUserSku] = useState<string | null>(null);
  const selectedSku = userSku ?? defaultSelection(products.subs);
  const [awaitingPromo, setAwaitingPromo] = useState(false);

  useEffect(() => {
    track('SUBSCRIPTION_VIEWED');
    void StoreService.loadProducts();
  }, []);

  // A promo redemption completes asynchronously through the purchase listener; watch the
  // entitlement flip instead of the redeem call's own resolution (SubscriptionView.swift:252-257).
  // Genuinely reacting to an external system's async result, not a render-time derivation, so the
  // setState-in-effect stays here (see `src/native/audio/recorder.ts` for the same precedent).
  useEffect(() => {
    if (awaitingPromo && isPro) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external event (entitlement flip after a promo redemption) → state, no render loop
      setAwaitingPromo(false);
      router.back();
    }
  }, [awaitingPromo, isPro, router]);

  const action = computePrimaryAction({
    isPro,
    currentTier,
    selectedSku: selectedSku ?? '',
    isSub: isSubSku(selectedSku),
  });

  const onPrimary = async () => {
    if (!selectedSku) return;
    if (action === 'cancel') {
      await StoreService.manageSubscriptions();
      // `manageSubscriptions()` already invalidates this on its own `finally`, but the paywall's
      // own cache read (`status?.tier === sku` above) must never race a stale entry either, so the
      // cancel action invalidates it explicitly too (resolution note, task-M5.2-brief.md).
      await queryClient.invalidateQueries({ queryKey: keys.subscription.status });
      return;
    }
    await purchase(selectedSku);
  };

  const purchase = async (sku: string) => {
    try {
      const outcome = await StoreService.purchasePro(sku);
      if (outcome === 'purchased') {
        const status = queryClient.getQueryData<SubscriptionStatusDto>(keys.subscription.status);
        if (status?.tier === sku) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => undefined,
          );
          router.back();
        }
      } else if (outcome === 'pending') {
        Alert.alert(t('Purchase pending approval'));
      }
      // 'cancelled': user backed out of the store sheet — nothing to do.
    } catch (err) {
      if (err instanceof StoreError) Alert.alert(t(err.key, err.params));
    }
  };

  const onRestore = async () => {
    track('RESTORE_PURCHASE_CLICKED');
    await restore();
  };

  const restore = async () => {
    try {
      const status = await StoreService.restore();
      if (isProTier(status)) router.back();
    } catch (err) {
      if (err instanceof StoreError) Alert.alert(t(err.key, err.params));
    }
  };

  const onPromo = async () => {
    setAwaitingPromo(true);
    try {
      await StoreService.redeemOfferCode();
      // The redeem sheet can be dismissed without entering a code — `redeemOfferCode()` still
      // resolves (it always restores afterwards). Read the freshest cache entry directly rather
      // than the `isPro` closed over at call time, which could be stale by the time this resolves.
      // If it's still free, don't leave the "verifying…" banner stuck — the effect below still owns
      // closing the paywall on an eventual entitlement flip while this stays awaiting.
      const status = queryClient.getQueryData<SubscriptionStatusDto>(keys.subscription.status);
      if (!isProTier(status)) setAwaitingPromo(false);
    } catch (err) {
      setAwaitingPromo(false);
      if (err instanceof StoreError) Alert.alert(t(err.key, err.params));
    }
  };

  const onClose = () => router.back();

  return {
    loading,
    purchasing,
    hasPendingRetry,
    subs: products.subs,
    packs: products.packs,
    selectedSku,
    selectSku: setUserSku,
    primaryAction: action,
    onPrimary,
    onClose,
    onRestore,
    onPromo,
    awaitingPromo,
    statusUnavailable,
  };
}
