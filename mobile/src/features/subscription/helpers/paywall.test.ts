import type { ProductSubscription } from 'expo-iap';

import {
  actionLabel,
  autoRenewNoticeLabel,
  COMPARE_ROWS,
  PAYWALL_POINTS,
  primaryAction,
  productPeriodLabel,
  productPriceLabel,
  shouldCloseAfterPurchase,
  skuNameLabel,
} from './paywall';

/**
 * Minimal `t` double: since these helpers pass the raw English source string as the key (i18next
 * `keySeparator: false`), simulate en.json's own interpolation markers by substituting `%@`
 * occurrences with `{0}`, `{1}`, ... in order.
 */
const t = (key: string, opts?: Record<string, unknown>) => {
  let i = 0;
  return key.replace(/%@/g, () => String(opts?.[i++] ?? ''));
};

function iosSub(
  id: string,
  unit: 'day' | 'week' | 'month' | 'year' | null,
  n: string | null,
  price = 10,
): ProductSubscription {
  return {
    id,
    type: 'subs',
    platform: 'ios',
    title: id,
    description: `desc-${id}`,
    displayPrice: `$${price}`,
    currency: 'USD',
    price,
    displayNameIOS: id,
    isFamilyShareableIOS: false,
    jsonRepresentationIOS: '{}',
    introductoryPricePaymentModeIOS: 'empty',
    typeIOS: 'auto-renewable-subscription',
    subscriptionPeriodUnitIOS: unit,
    subscriptionPeriodNumberIOS: n,
  } as ProductSubscription;
}

function androidSub(id: string, billingPeriod: string, price = 10): ProductSubscription {
  return {
    id,
    type: 'subs',
    platform: 'android',
    title: id,
    nameAndroid: id,
    description: `desc-${id}`,
    displayPrice: `$${price}`,
    currency: 'USD',
    price,
    subscriptionOffers: [
      {
        id: 'offer-0',
        displayPrice: `$${price}`,
        price,
        type: 'introductory',
        offerTokenAndroid: 'token-0',
        pricingPhasesAndroid: {
          pricingPhaseList: [
            {
              billingCycleCount: 1,
              billingPeriod,
              formattedPrice: `$${price}`,
              priceAmountMicros: '10000000',
              priceCurrencyCode: 'USD',
              recurrenceMode: 1,
            },
          ],
        },
      },
    ],
  } as ProductSubscription;
}

describe('primaryAction', () => {
  it.each([
    [{ isPro: false, currentTier: 'free', selectedSku: 'pro_weekly', isSub: true }, 'subscribe'],
    [{ isPro: false, currentTier: 'free', selectedSku: 'pay_once', isSub: false }, 'buy'],
    [
      { isPro: true, currentTier: 'pro_monthly', selectedSku: 'pro_monthly', isSub: true },
      'cancel',
    ],
    [
      { isPro: true, currentTier: 'pro_monthly', selectedSku: 'pro_yearly', isSub: true },
      'upgrade',
    ],
    [{ isPro: true, currentTier: 'pay_once', selectedSku: 'pro_yearly', isSub: true }, 'upgrade'],
  ] as const)('%j -> %s', (params, expected) => {
    expect(primaryAction(params)).toBe(expected);
  });
});

describe('actionLabel', () => {
  it.each([
    ['subscribe', 'Subscribe'],
    ['buy', 'Buy'],
    ['cancel', 'Cancel Subscription'],
    ['upgrade', 'Change Plan'],
  ] as const)('%s -> %s', (action, label) => {
    expect(actionLabel(action, t)).toBe(label);
  });
});

describe('shouldCloseAfterPurchase', () => {
  it('true when the current tier matches the selected sku', () => {
    expect(shouldCloseAfterPurchase('pro_yearly', 'pro_yearly')).toBe(true);
  });

  it('false when they differ (upgrade still pending / cancelled / not-yet-applied)', () => {
    expect(shouldCloseAfterPurchase('free', 'pro_yearly')).toBe(false);
    expect(shouldCloseAfterPurchase('pro_monthly', 'pro_yearly')).toBe(false);
  });
});

describe('skuNameLabel', () => {
  it.each([
    ['pro_weekly', 'Weekly'],
    ['pro_monthly', 'Monthly'],
    ['pro_yearly', 'Yearly'],
  ])('%s -> %s', (sku, label) => {
    expect(skuNameLabel(sku, t)).toBe(label);
  });

  it('falls back to the raw sku for an unknown id', () => {
    expect(skuNameLabel('pay_once', t)).toBe('pay_once');
  });
});

describe('productPeriodLabel', () => {
  it('normalizes iOS week/month/year units', () => {
    expect(productPeriodLabel(iosSub('pro_weekly', 'week', '1'), t)).toBe('week');
    expect(productPeriodLabel(iosSub('pro_monthly', 'month', '1'), t)).toBe('month');
    expect(productPeriodLabel(iosSub('pro_yearly', 'year', '1'), t)).toBe('year');
  });

  it('applies the Apple "7 days = 1 week" bug fix', () => {
    expect(productPeriodLabel(iosSub('pro_weekly', 'day', '7'), t)).toBe('week');
  });

  it('parses the Android last pricing-phase ISO period', () => {
    expect(productPeriodLabel(androidSub('pro_yearly', 'P1Y'), t)).toBe('year');
    expect(productPeriodLabel(androidSub('pro_monthly', 'P1M'), t)).toBe('month');
  });

  it('returns an empty string when no period is resolvable', () => {
    expect(productPeriodLabel(iosSub('pay_once', null, null), t)).toBe('');
  });
});

describe('productPriceLabel', () => {
  it('combines displayPrice and the normalized period', () => {
    expect(productPriceLabel(iosSub('pro_yearly', 'year', '1', 99.99), t)).toBe('$99.99/year');
  });

  it('falls back to bare displayPrice when there is no period', () => {
    expect(productPriceLabel(iosSub('pay_once', null, null, 49.99), t)).toBe('$49.99');
  });
});

describe('autoRenewNoticeLabel', () => {
  it('interpolates price and period into the two-placeholder key', () => {
    expect(autoRenewNoticeLabel('$99.99', 'year', t)).toBe(
      'Plan auto-renews for $99.99/year until canceled.',
    );
  });
});

describe('PAYWALL_POINTS', () => {
  it('has 5 points, with only the video point showing the scan quota', () => {
    expect(PAYWALL_POINTS).toHaveLength(5);
    expect(PAYWALL_POINTS.filter((p) => p.showsVideoQuota)).toHaveLength(1);
    expect(PAYWALL_POINTS.find((p) => p.showsVideoQuota)?.title).toBe('Extract pins by video');
  });
});

describe('COMPARE_ROWS', () => {
  it('has 5 "unlock with Pro" rows and 6 "included in all plans" rows', () => {
    expect(COMPARE_ROWS.unlock).toHaveLength(5);
    expect(COMPARE_ROWS.included).toHaveLength(6);
  });

  it('every "included" row is a checkmark on both sides', () => {
    for (const row of COMPARE_ROWS.included) {
      expect(row.basic).toEqual({ kind: 'check' });
      expect(row.pro).toEqual({ kind: 'check' });
    }
  });
});
