/**
 * Screen state for the free-trial promo — port of `FreeTrialView`'s product load (:81-83,
 * :354-357), 1s countdown (:205-213), auto-dismiss task (:84-100), and purchase flow (:227-272,
 * :353-371). Keeps the `/free-trial` route thin.
 *
 * Every path that leaves the screen (auto-dismiss on expiry, the close button, a successful
 * purchase) routes through one `dismiss()` guarded by `closedRef`, so `router.back()` only ever
 * fires once — without the guard, the 1s countdown interval keeps ticking after expiry and the
 * auto-dismiss effect re-fires `router.back()` on every subsequent tick.
 */
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import type { ProductSubscription } from 'expo-iap';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { keys } from '@/api/keys';
import { useAppLanguage } from '@/i18n';
import { StoreError, StoreService, useStore } from '@/iap';
import { useSettingsStore } from '@/stores/settingsStore';

import { countdown, isWindowOpen, type TrialCountdownValue } from './helpers/trialWindow';
import type { SubscriptionStatusDto } from './types';

const MONTHLY_SKU = 'pro_monthly';

export interface UseFreeTrialResult {
  product: ProductSubscription | null;
  deadline: number | null;
  remaining: TrialCountdownValue;
  purchasing: boolean;
  start: () => Promise<void>;
  close: () => void;
}

export function useFreeTrial(): UseFreeTrialResult {
  useAppLanguage();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  const deadline = useSettingsStore((s) => s.trialOfferDeadline);
  const { products, purchasing } = useStore();
  const [now, setNow] = useState(() => Date.now());
  const closedRef = useRef(false);

  const dismiss = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    router.back();
  };

  useEffect(() => {
    if (products.subs.length === 0) void StoreService.loadProducts();
  }, [products.subs.length]);

  useEffect(() => {
    const id = setInterval(() => {
      if (closedRef.current) {
        clearInterval(id);
        return;
      }
      setNow(Date.now());
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  const remaining = countdown(deadline, now);
  const remainingSeconds = remaining.hrs * 3_600 + remaining.min * 60 + remaining.sec;

  // Auto-dismiss once the offer window elapses while the screen is open, so it never advertises
  // "2 weeks free / No Payment today" past the advertised deadline (FreeTrialView.swift:84-100).
  useEffect(() => {
    if (closedRef.current) return;
    if (deadline === null) return;
    if (remainingSeconds > 0) return;
    if (isWindowOpen(deadline, now)) return;
    dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `dismiss`/`router` are stable per render; only the countdown inputs should re-run this
  }, [deadline, now, remainingSeconds]);

  const product = products.subs.find((p) => p.id === MONTHLY_SKU) ?? null;

  const start = async () => {
    try {
      const outcome = await StoreService.purchasePro(MONTHLY_SKU);
      if (outcome === 'purchased') {
        const status = queryClient.getQueryData<SubscriptionStatusDto>(keys.subscription.status);
        if (status?.tier === MONTHLY_SKU) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => undefined,
          );
          dismiss();
        }
      } else if (outcome === 'pending') {
        Alert.alert(t('Purchase pending approval'));
      }
      // 'cancelled': user backed out of the store sheet — nothing to do.
    } catch (err) {
      if (err instanceof StoreError) Alert.alert(t(err.key, err.params));
    }
  };

  return { product, deadline, remaining, purchasing, start, close: dismiss };
}
