import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  AdEventType,
  RewardedAdEventType,
  InterstitialAd,
  RewardedAd,
  TestIds,
} from 'react-native-google-mobile-ads';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import { env, isProd } from '@/lib/env';

export const useAdPrivacy = create<{ required: boolean }>(() => ({ required: false }));
export const rewardedAdsConfigured = !isProd || Boolean(env.adUnits.rewarded);
type Placement = 'endTrip' | 'market';
let initialized = false;
let initializing: Promise<void> | null = null;
let marketReturns = 0;
let marketShown = false;
let presenting = false;
const interstitials = new Map<Placement, InterstitialAd>();
let rewarded: RewardedAd | null = null;
let consentGeneration = 0;
const loading = new Set<string>();
function unit(kind: Placement | 'rewarded') {
  if (!isProd) return kind === 'rewarded' ? TestIds.REWARDED : TestIds.INTERSTITIAL;
  return env.adUnits[kind] || null;
}
function preload(kind: Placement | 'rewarded') {
  const id = unit(kind);
  if (!initialized || !id || loading.has(kind)) return;
  if (kind === 'rewarded' ? rewarded : interstitials.has(kind)) return;
  loading.add(kind);
  const generation = consentGeneration;
  const ad =
    kind === 'rewarded' ? RewardedAd.createForAdRequest(id) : InterstitialAd.createForAdRequest(id);
  const cleanup = () => {
    loading.delete(kind);
    offLoaded();
    offError();
    clearTimeout(timer);
  };
  const offError = (ad as InterstitialAd).addAdEventListener(AdEventType.ERROR, cleanup);
  const offLoaded =
    kind === 'rewarded'
      ? (ad as RewardedAd).addAdEventListener(RewardedAdEventType.LOADED, () => {
          if (initialized && generation === consentGeneration) rewarded = ad as RewardedAd;
          cleanup();
        })
      : (ad as InterstitialAd).addAdEventListener(AdEventType.LOADED, () => {
          if (initialized && generation === consentGeneration)
            interstitials.set(kind, ad as InterstitialAd);
          cleanup();
        });
  const timer = setTimeout(cleanup, 30_000);
  try {
    ad.load();
  } catch {
    cleanup();
  }
}
export async function initializeAds() {
  if (isProd && !Object.values(env.adUnits).some(Boolean)) return;
  if (initialized || initializing || AppState.currentState !== 'active') return initializing;
  initializing = (async () => {
    try {
      let consent;
      try {
        consent = await AdsConsent.gatherConsent();
      } catch {
        consent = await AdsConsent.getConsentInfo();
      }
      useAdPrivacy.setState({
        required:
          consent.privacyOptionsRequirementStatus ===
          AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
      });
      if (!consent.canRequestAds) return;
      if (Platform.OS === 'ios' && AppState.currentState === 'active')
        await requestTrackingPermissionsAsync();
      await mobileAds().initialize();
      initialized = true;
      preload('endTrip');
      preload('market');
      preload('rewarded');
    } catch {
      /* Consent/network failure must not block app use. */
    } finally {
      initializing = null;
    }
  })();
  return initializing;
}
export async function showAdPrivacyOptions() {
  consentGeneration++;
  rewarded = null;
  interstitials.clear();
  await AdsConsent.showPrivacyOptionsForm();
  const consent = await AdsConsent.getConsentInfo();
  useAdPrivacy.setState({
    required:
      consent.privacyOptionsRequirementStatus ===
      AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
  });
  if (consent.canRequestAds) {
    preload('endTrip');
    preload('market');
    preload('rewarded');
  }
  if (!consent.canRequestAds) {
    initialized = false;
    rewarded = null;
    interstitials.clear();
  }
}
/** All paths resolve, including unavailable, failed, and early-dismissed ads. */
async function present(ad: InterstitialAd | RewardedAd, reward: boolean): Promise<boolean> {
  if (presenting || AppState.currentState !== 'active') return false;
  presenting = true;
  return new Promise((resolve) => {
    let earned = false;
    let done = false;
    const cleanups: (() => void)[] = [];
    const finish = () => {
      if (done) return;
      done = true;
      presenting = false;
      cleanups.forEach((fn) => fn());
      resolve(earned);
    };
    cleanups.push(
      (ad as InterstitialAd).addAdEventListener(AdEventType.CLOSED, finish),
      (ad as InterstitialAd).addAdEventListener(AdEventType.ERROR, finish),
    );
    if (reward)
      cleanups.push(
        (ad as RewardedAd).addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
        }),
      );
    const timeout = setTimeout(finish, 180_000);
    cleanups.push(() => clearTimeout(timeout));
    try {
      ad.show().catch(finish);
    } catch {
      finish();
    }
  });
}
export async function showInterstitial(placement: Placement, isPro: boolean) {
  if (isPro || presenting) return;
  const ad = interstitials.get(placement);
  if (!ad) {
    preload(placement);
    return;
  }
  interstitials.delete(placement);
  try {
    await present(ad, false);
  } finally {
    preload(placement);
  }
}
export async function showRewarded(
  isPro: boolean,
): Promise<'earned' | 'dismissed' | 'unavailable'> {
  if (isPro || presenting || !rewarded) {
    preload('rewarded');
    return 'unavailable';
  }
  const ad = rewarded;
  rewarded = null;
  try {
    return (await present(ad, true)) ? 'earned' : 'dismissed';
  } finally {
    preload('rewarded');
  }
}
export function recordMarketPlanDetailDismissed() {
  marketReturns++;
}
export async function maybeShowMarketInterstitial(isPro: boolean) {
  if (isPro || marketShown || marketReturns < 2) return;
  marketShown = true;
  await showInterstitial('market', isPro);
}
export function resetAdsSession() {
  marketReturns = 0;
  marketShown = false;
}
