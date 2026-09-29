import { useRewardAllowance, recordRewardAllowance } from '../rewardAllowance';
import { FREE_SCAN, ScanPackPicker } from './ScanPackPicker';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { track } from '@/analytics/track';
import { useEffect, useState, useRef } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAppLanguage } from '@/i18n';
import { useAuthStore } from '@/auth/authStore';
import { useMe } from '@/features/me/useMe';
import { keys } from '@/api/keys';
import { useIsPro } from '@/features/subscription/api/queries';
import { SCAN_PACK_SKUS } from '@/features/subscription/types';
import { loadProducts, purchaseScanCredits, reconcilePending } from '@/iap/StoreService';
import { useStore } from '@/iap/useStore';
import { requireOnline } from '@/offline/guardOnline';
import { showRewarded, rewardedAdsConfigured } from '@/native/ads/ads';
import { useScanCredits } from '../api/queries';
import { claimRewardedCredit } from '../api/credits';
import type { CreditError } from '../types';
import { BoardButton, BoardSheet, styles } from './common';
import { rasterIllustration } from '@/ui/components/RasterIllustration';

const FreeCard = rasterIllustration(
  require('@/assets/images/board/freeVideoScanCard.webp') as number,
  { width: 94, height: 96 },
);
const OutOfQuota = rasterIllustration(
  require('@/assets/images/board/outOfQuotaExtraction.png') as number,
  { width: 77, height: 97 },
);
export function CreditSheets({
  onClose,
  creditError,
}: {
  onClose: () => void;
  creditError?: CreditError | null;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const client = useQueryClient();
  const isPro = useIsPro();
  const products = useStore((s) => s.products.packs);
  const purchasing = useStore((s) => s.purchasing);
  const pending = useStore((s) => s.hasPendingRetry);
  const storeError = useStore((s) => s.error);
  const userId = useMe().data?.id;
  const alive = useRef(true);
  const adInFlight = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const quota = useScanCredits();
  const [preferredSku, setSelectedSku] = useState<string>(SCAN_PACK_SKUS[0]);
  const allowance = useRewardAllowance();
  const rewardCapReached =
    allowance.remaining === 0 && allowance.day === new Date().toISOString().slice(0, 10);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [rewarding, setRewarding] = useState(false);
  const [stage, setStage] = useState<'quota' | 'packs' | 'claimed'>(
    creditError ? 'quota' : 'packs',
  );
  useEffect(() => {
    track('SCAN_CREDITS_PAYWALL_VIEWED');
    void loadProducts().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (creditError)
      client.setQueryData(keys.scanCredits.balance, {
        available: creditError.available,
        nextProGrantAt: creditError.nextProGrantAt,
      });
  }, [creditError, client]);
  const refresh = () => client.invalidateQueries({ queryKey: keys.scanCredits.balance });
  const watchReward = () => {
    if (!requireOnline(t)) return;
    // Unmount this sheet before the full-screen native ad is presented.
    adInFlight.current = true;
    setRewarding(true);
    setTimeout(() => {
      if (!alive.current || useAuthStore.getState().status !== 'authed') return;
      void (async () => {
        try {
          const result = await showRewarded(isPro);
          if (
            !alive.current ||
            useAuthStore.getState().status !== 'authed' ||
            client.getQueryData<{ id: number }>(keys.me)?.id !== userId
          )
            return;
          if (result === 'earned') {
            const grant = await claimRewardedCredit(randomUUID());
            await refresh();
            recordRewardAllowance(grant.remainingToday);
            if (grant.granted) setStage('claimed');
            else setMessage('Daily limit reached');
          } else
            setMessage(
              result === 'unavailable'
                ? 'Ad unavailable. Please try again later.'
                : 'Watch the full ad to earn a scan.',
            );
        } catch {
          if (alive.current) setMessage('Something went wrong');
        } finally {
          adInFlight.current = false;
          if (alive.current) setRewarding(false);
        }
      })();
    }, 500);
  };
  const showReward = !isPro && rewardedAdsConfigured && !rewardCapReached;
  const selectedSku =
    products.some((product) => product.id === preferredSku) ||
    (preferredSku === FREE_SCAN && showReward)
      ? preferredSku
      : (products[0]?.id ?? (showReward ? FREE_SCAN : SCAN_PACK_SKUS[0]));
  const product = products.find((p) => p.id === selectedSku);
  const freeSelected = selectedSku === FREE_SCAN;
  const purchase = async () => {
    if (freeSelected) {
      if (!showReward || !userId) return;
      watchReward();
      return;
    }
    if (!requireOnline(t)) return;
    setBusy(true);
    setMessage('');
    try {
      const outcome = await purchaseScanCredits(selectedSku);
      if (outcome === 'purchased') {
        await refresh();
        onClose();
      } else if (outcome === 'pending') setMessage('Purchase pending approval');
    } catch {
      setMessage('Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  const renewal = quota.data?.nextProGrantAt ?? creditError?.nextProGrantAt;
  if (rewarding) return null;
  const close = () => {
    if (!adInFlight.current) onClose();
  };
  if (stage === 'quota')
    return (
      <BoardSheet height={440} onClose={close}>
        <View style={{ alignItems: 'center', gap: 24, paddingTop: 10 }}>
          <OutOfQuota width={100} height={100} />
          <View style={{ gap: 8, paddingHorizontal: 10 }}>
            <Text style={[styles.title, { textAlign: 'center', fontWeight: '700', fontSize: 22 }]}>
              {t('Out of scan credits')}
            </Text>
            <Text style={[styles.text, { textAlign: 'center', color: colors.neutral600 }]}>
              {renewal
                ? t("You're out of scan credits. Your Pro plan adds more on %@.", {
                    0: new Date(renewal).toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    }),
                  })
                : t(
                    "You're out of scan credits. Buy a pack, or go Pro for a batch of scan credits.",
                  )}
            </Text>
          </View>
          <View style={{ gap: 12, alignSelf: 'stretch', paddingHorizontal: 10 }}>
            <BoardButton
              title={t('Buy scan credits')}
              disabled={creditError?.canPurchase === false}
              onPress={() => setStage('packs')}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                router.push('/paywall');
              }}
            >
              <Text
                style={[styles.text, { textAlign: 'center', color: colors.blueBase, fontSize: 16 }]}
              >
                {t('Upgrade to Pro')}
              </Text>
            </Pressable>
          </View>
        </View>
      </BoardSheet>
    );
  if (stage === 'claimed')
    return (
      <BoardSheet height={300} onClose={close}>
        <View style={{ alignItems: 'center', gap: 16 }}>
          <FreeCard width={94} height={96} />
          <View style={{ gap: 6 }}>
            <Text style={[styles.title, { textAlign: 'center' }]}>{t('Claimed 1 Credit')}</Text>
            <Text style={[styles.text, { textAlign: 'center', color: colors.neutral700 }]}>
              {t('You can get %lld more today.', { 0: allowance.remaining ?? 0 })}
              {'\n'}
              {t('Watch ads to get free scan credit')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <BoardButton
              variant="dark"
              style={{ flex: 1 }}
              disabled={!showReward}
              title={t('Get 1 more')}
              onPress={watchReward}
            />
            <BoardButton style={{ flex: 1 }} title={t('Got it')} onPress={onClose} />
          </View>
        </View>
      </BoardSheet>
    );
  const count = Number(selectedSku.split('_').at(-1));
  return (
    <BoardSheet
      height={550}
      plain
      onClose={close}
      footer={
        <View
          style={{
            padding: 16,
            gap: 10,
            backgroundColor: 'white',
            boxShadow: '0px 0px 13px #00000040',
          }}
        >
          <CreditLegal />
          <BoardButton
            testID="scan-pack-buy"
            variant="dark"
            title={
              freeSelected
                ? t('Watch ad for 1 free scan')
                : product
                  ? `${t(count === 1 ? 'Get 1 video scan' : 'Get %lld video scans', { 0: count })} · ${product.displayPrice}`
                  : t('Scan packs unavailable')
            }
            disabled={busy || purchasing || (freeSelected ? !showReward || !userId : !product)}
            loading={busy || purchasing}
            onPress={() => void purchase()}
          />
        </View>
      }
    >
      <View style={{ paddingHorizontal: 22, paddingTop: 34, gap: 6, marginBottom: 20 }}>
        <Text
          style={{ ...beVietnamPro(24, 'medium'), letterSpacing: -0.96, color: colors.neutral950 }}
        >
          {t('Discover more hidden gems\nby social videos')}
        </Text>
        <Text style={{ ...beVietnamPro(13), letterSpacing: -0.65, color: colors.neutral600 }}>
          {t(
            'Unlock more video scans to instantly detect places from videos and save them into your favorite lists.',
          )}
        </Text>
      </View>
      {products.length || showReward ? (
        <ScanPackPicker
          selected={selectedSku}
          onSelect={setSelectedSku}
          disabled={busy || purchasing}
          showReward={showReward}
        />
      ) : (
        <View
          style={{
            marginHorizontal: 22,
            padding: 16,
            borderRadius: 20,
            backgroundColor: colors.neutral100,
            gap: 8,
          }}
        >
          <Text style={styles.subtitle}>{t('Video scan packs are unavailable')}</Text>
          <Text style={styles.muted}>{t('Please check your connection and try again.')}</Text>
          <BoardButton
            title={t('Try again')}
            variant="secondary"
            onPress={() => {
              if (requireOnline(t))
                void loadProducts().catch(() => setMessage('Something went wrong'));
            }}
          />
        </View>
      )}
      {pending ? (
        <BoardButton
          title={t('Restore purchases')}
          disabled={busy || purchasing}
          onPress={async () => {
            if (!requireOnline(t)) return;
            setBusy(true);
            try {
              await reconcilePending();
              await refresh();
            } catch {
              setMessage('Something went wrong');
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {message ? <Text style={[styles.text, { margin: 22 }]}>{t(message)}</Text> : null}
      {storeError ? (
        <Text style={[styles.error, { margin: 22 }]}>{t(storeError.key, storeError.params)}</Text>
      ) : null}
    </BoardSheet>
  );
}
function CreditLegal() {
  useAppLanguage();
  const { t } = useTranslation();
  const links = [
    { label: t('Privacy Policy'), url: 'https://oneplan.space/privacy-policy' },
    { label: t('Terms of Service'), url: 'https://oneplan.space/termandconditions' },
    {
      label: t('Terms of EULA'),
      url: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
    },
  ];
  const copy = t(
    'By purchasing, you agree to this transaction and our Privacy Policy, Terms of Service &  Terms of EULA',
  );
  const parts: { text: string; url?: string }[] = [];
  let rest = copy;
  while (rest) {
    const next = links
      .map((link) => ({ ...link, index: rest.indexOf(link.label) }))
      .filter((link) => link.index >= 0)
      .sort((a, b) => a.index - b.index)[0];
    if (!next) {
      parts.push({ text: rest });
      break;
    }
    if (next.index) parts.push({ text: rest.slice(0, next.index) });
    parts.push({ text: next.label, url: next.url });
    rest = rest.slice(next.index + next.label.length);
  }
  return (
    <Text style={{ ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.42 }}>
      {parts.map((part, i) => (
        <Text
          key={i}
          style={part.url ? { color: colors.contentB, textDecorationLine: 'underline' } : undefined}
          onPress={
            part.url
              ? () => {
                  void Linking.openURL(part.url!);
                }
              : undefined
          }
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}
