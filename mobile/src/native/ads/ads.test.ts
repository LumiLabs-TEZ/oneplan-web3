import { AppState } from 'react-native';
import { AdsConsent, InterstitialAd, RewardedAd } from 'react-native-google-mobile-ads';
import {
  initializeAds,
  showInterstitial,
  showRewarded,
  showAdPrivacyOptions,
  recordMarketPlanDetailDismissed,
  maybeShowMarketInterstitial,
  useAdPrivacy,
} from './ads';
type FakeAd = { emit: (event: string) => void; show: jest.Mock };
const factory = InterstitialAd.createForAdRequest as jest.Mock;
const fake = (index: number) => factory.mock.results[index]!.value as FakeAd;
it('gates SDK loading on consent, handles rewarded and interstitial terminal paths', async () => {
  jest.useFakeTimers();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  (AdsConsent.gatherConsent as jest.Mock).mockResolvedValueOnce({
    canRequestAds: false,
    privacyOptionsRequirementStatus: 'REQUIRED',
  });
  await initializeAds();
  expect(factory).not.toHaveBeenCalled();
  expect(useAdPrivacy.getState().required).toBe(true);
  await initializeAds();
  expect(factory).toHaveBeenCalledTimes(3);
  const end = fake(0),
    market = fake(1),
    reward = fake(2);
  end.emit('loaded');
  market.emit('loaded');
  reward.emit('rewarded_loaded');
  await showInterstitial('endTrip', true);
  expect(end.show).not.toHaveBeenCalled();
  const endFlow = showInterstitial('endTrip', false);
  end.emit('error');
  await endFlow;
  expect(end.show).toHaveBeenCalledTimes(1);
  const early = showRewarded(false);
  reward.emit('closed');
  expect(await early).toBe('dismissed');
  const nextReward = fake(factory.mock.results.length - 1);
  nextReward.emit('rewarded_loaded');
  const earned = showRewarded(false);
  nextReward.emit('earned');
  nextReward.emit('closed');
  expect(await earned).toBe('earned');
  recordMarketPlanDetailDismissed();
  await maybeShowMarketInterstitial(false);
  expect(market.show).not.toHaveBeenCalled();
  recordMarketPlanDetailDismissed();
  const marketFlow = maybeShowMarketInterstitial(false);
  market.emit('closed');
  await marketFlow;
  await maybeShowMarketInterstitial(false);
  expect(market.show).toHaveBeenCalledTimes(1);
  await showInterstitial('endTrip', false); // new ad is not loaded: immediate continuation
  (AdsConsent.getConsentInfo as jest.Mock).mockResolvedValueOnce({ canRequestAds: false });
  await showAdPrivacyOptions();
  expect(await showRewarded(false)).toBe('unavailable');
  expect(RewardedAd.createForAdRequest).toBeDefined();
  jest.clearAllTimers();
  jest.useRealTimers();
});
