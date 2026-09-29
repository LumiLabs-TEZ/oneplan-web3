import type { Product, ProductSubscription } from 'expo-iap';

import {
  androidOfferToken,
  dailyPriceLabel,
  defaultSelection,
  hasFreeTrialOfferAndroid,
  isoPeriodDays,
  normalizedPeriod,
  periodWeight,
  sortByPaywallOrder,
  videoQuotaLabel,
} from './products';

/** Minimal `t` double: returns the key with `{{0}}` interpolated (mirrors i18next keySeparator:false). */
const t = (key: string, opts?: Record<string, unknown>) =>
  key.replace('%@', String(opts?.[0] ?? ''));

function iosSub(
  id: string,
  unit: 'day' | 'week' | 'month' | 'year' | 'empty' | null,
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

function androidSub(
  id: string,
  phases: { billingPeriod: string; priceAmountMicros: string }[][],
  price = 10,
): ProductSubscription {
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
    subscriptionOffers: phases.map((list, i) => ({
      id: `offer-${i}`,
      displayPrice: `$${price}`,
      price,
      type: 'introductory',
      offerTokenAndroid: `token-${i}`,
      pricingPhasesAndroid: {
        pricingPhaseList: list.map((p) => ({
          billingCycleCount: 1,
          billingPeriod: p.billingPeriod,
          formattedPrice: `$${price}`,
          priceAmountMicros: p.priceAmountMicros,
          priceCurrencyCode: 'USD',
          recurrenceMode: 1,
        })),
      },
    })),
  } as ProductSubscription;
}

describe('isoPeriodDays', () => {
  it.each([
    ['P1W', 7],
    ['P1M', 30],
    ['P1Y', 365],
    ['P7D', 7],
    ['P3M', 90],
  ])('%s -> %s days', (iso, days) => {
    expect(isoPeriodDays(iso)).toBe(days);
  });

  it('returns null for an unparseable period', () => {
    expect(isoPeriodDays('weekly')).toBeNull();
    expect(isoPeriodDays('')).toBeNull();
  });
});

describe('periodWeight', () => {
  it('weighs iOS periods by approximate day count', () => {
    expect(periodWeight(iosSub('pro_weekly', 'week', '1'))).toBe(7);
    expect(periodWeight(iosSub('pro_monthly', 'month', '1'))).toBe(30);
    expect(periodWeight(iosSub('pro_yearly', 'year', '1'))).toBe(365);
  });

  it('defaults the iOS period count to 1 when the store omits it', () => {
    expect(periodWeight(iosSub('pro_monthly', 'month', null))).toBe(30);
  });

  it('returns -1 when the period is unknown (StoreManager periodWeight guard)', () => {
    expect(periodWeight(iosSub('pay_once', null, null))).toBe(-1);
    expect(periodWeight(iosSub('pay_once', 'empty', '1'))).toBe(-1);
  });

  it('weighs Android periods from the LAST pricing phase (the regular one)', () => {
    const p = androidSub('pro_yearly', [
      [
        { billingPeriod: 'P1W', priceAmountMicros: '0' },
        { billingPeriod: 'P1Y', priceAmountMicros: '99000000' },
      ],
    ]);
    expect(periodWeight(p)).toBe(365);
  });
});

describe('sortByPaywallOrder / defaultSelection', () => {
  const products = [
    iosSub('pro_weekly', 'week', '1'),
    iosSub('pro_yearly', 'year', '1'),
    iosSub('pro_monthly', 'month', '1'),
  ];

  it('orders by PRO_SUB_SKUS (yearly, monthly, weekly)', () => {
    expect(sortByPaywallOrder(products).map((p) => p.id)).toEqual([
      'pro_yearly',
      'pro_monthly',
      'pro_weekly',
    ]);
  });

  it('keeps unknown SKUs after the known ones', () => {
    const withExtra = [...products, iosSub('pro_lifetime', 'year', '5')];
    expect(sortByPaywallOrder(withExtra).at(-1)?.id).toBe('pro_lifetime');
  });

  it('preselects the longest period ("Best value")', () => {
    expect(defaultSelection(products)).toBe('pro_yearly');
  });

  it('falls back to the first product when no period is known', () => {
    expect(defaultSelection([iosSub('a', null, null), iosSub('b', null, null)])).toBe('a');
  });

  it('returns null for an empty list', () => {
    expect(defaultSelection([])).toBeNull();
  });
});

describe('normalizedPeriod', () => {
  it('maps the Apple 7-day weekly bug to "week" (SubscriptionView.swift:786)', () => {
    expect(normalizedPeriod('day', 7, t)).toBe('week');
  });

  it('maps 14 days to "2 weeks"', () => {
    expect(normalizedPeriod('day', 14, t)).toBe('2 weeks');
  });

  it('passes through real units', () => {
    expect(normalizedPeriod('month', 1, t)).toBe('month');
    expect(normalizedPeriod('year', 1, t)).toBe('year');
    expect(normalizedPeriod('day', 1, t)).toBe('day');
  });

  it('returns an empty string for an unknown unit', () => {
    expect(normalizedPeriod('empty', 1, t)).toBe('');
    expect(normalizedPeriod(null, 1, t)).toBe('');
  });
});

describe('dailyPriceLabel', () => {
  it('divides the price by the approximate day count', () => {
    const label = dailyPriceLabel(iosSub('pro_monthly', 'month', '1', 30), 'en-US', t);
    expect(label).toBe('~$1.00/day');
  });

  it('formats VND without decimals', () => {
    const vnd = { ...iosSub('pro_monthly', 'month', '1', 250_000), currency: 'VND' };
    const label = dailyPriceLabel(vnd as ProductSubscription, 'vi-VN', t);
    expect(label).toContain('8.333');
    expect(label).not.toContain(',33');
  });

  it('falls back to the product description when the period is unknown', () => {
    expect(dailyPriceLabel(iosSub('pay_once', null, null), 'en-US', t)).toBe('desc-pay_once');
  });
});

describe('videoQuotaLabel', () => {
  it.each([
    ['pro_weekly', '3 scans / week'],
    ['pro_monthly', '20 scans / month'],
    ['pro_yearly', '300 scans / year'],
    ['pay_once', '300 scans / year'],
  ])('%s -> %s', (sku, expected) => {
    expect(videoQuotaLabel(sku, t)).toBe(expected);
  });
});

describe('androidOfferToken / hasFreeTrialOfferAndroid', () => {
  const trial = androidSub('pro_monthly', [
    [
      { billingPeriod: 'P1W', priceAmountMicros: '0' },
      { billingPeriod: 'P1M', priceAmountMicros: '99000' },
    ],
  ]);
  const noTrial = androidSub('pro_monthly', [
    [{ billingPeriod: 'P1M', priceAmountMicros: '99000' }],
  ]);

  it('returns the first offer token', () => {
    expect(androidOfferToken(trial, 'pro_monthly')).toBe('token-0');
  });

  it('returns null when the product id does not match the SKU', () => {
    expect(androidOfferToken(trial, 'pro_yearly')).toBeNull();
  });

  it('returns null for a missing product or an iOS product', () => {
    expect(androidOfferToken(undefined, 'pro_monthly')).toBeNull();
    expect(androidOfferToken(iosSub('pro_monthly', 'month', '1'), 'pro_monthly')).toBeNull();
  });

  it('detects a free-trial offer by a zero first pricing phase', () => {
    expect(hasFreeTrialOfferAndroid(trial)).toBe(true);
    expect(hasFreeTrialOfferAndroid(noTrial)).toBe(false);
    expect(hasFreeTrialOfferAndroid(undefined)).toBe(false);
  });

  it('is false for an iOS product (intro eligibility is a StoreKit call)', () => {
    expect(hasFreeTrialOfferAndroid(iosSub('pro_monthly', 'month', '1'))).toBe(false);
  });
});

describe('type surface', () => {
  it('accepts a plain in-app Product where a Product is expected', () => {
    const pack = { id: 'oneplan.video_scan_5', type: 'in-app', platform: 'ios' } as Product;
    expect(videoQuotaLabel(pack.id, t)).toBe('300 scans / year');
  });
});
