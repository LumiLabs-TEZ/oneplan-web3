// Catalog mapping for the reward-shop cards: every server itemId must map to
// a card with the right artwork, and unknown ids must be dropped.
// Ported 1:1 from ios OnePlanTests/RewardShopItemTests.swift.

import { rewardShopCatalog } from './rewardShop';

const expectedAssets: [id: string, asset: string][] = [
  ['scan_credit_1', 'rewardScanCredit'],
  ['market_unlock', 'rewardMarketUnlock'],
  ['pro_7d', 'rewardPro7d'],
  ['pro_30d', 'rewardPro30d'],
];

describe('RewardShopItem catalog', () => {
  test.each(expectedAssets)('Known ids map to a card with the expected asset (%s)', (id, asset) => {
    const item = rewardShopCatalog({ id, price: 42 });
    expect(item).toBeDefined();
    expect(item?.id).toBe(id);
    expect(item?.assetName).toBe(asset);
    expect(item?.title).not.toBe('');
    expect(item?.subtitle).not.toBe('');
  });

  test.each(expectedAssets)('Price passes through untouched (%s)', (id) => {
    const item = rewardShopCatalog({ id, price: 137 });
    expect(item?.price).toBe(137);
  });

  test.each(expectedAssets)('isAvailable defaults to true and passes through (%s)', (id) => {
    const defaulted = rewardShopCatalog({ id, price: 10 });
    expect(defaulted?.isAvailable).toBe(true);

    const exhausted = rewardShopCatalog({ id, price: 10, isAvailable: false });
    expect(exhausted?.isAvailable).toBe(false);
  });

  test.each(['', 'pro_365d', 'scan_credit', 'SCAN_CREDIT_1'])(
    'Unknown item ids return undefined (%j)',
    (id) => {
      expect(rewardShopCatalog({ id, price: 30 })).toBeUndefined();
    },
  );

  test.each(expectedAssets)('gradient colours are 6-digit hex (%s)', (id) => {
    const item = rewardShopCatalog({ id, price: 1 });
    expect(item?.gradientTop).toMatch(/^#[0-9A-F]{6}$/);
    expect(item?.gradientBottom).toMatch(/^#[0-9A-F]{6}$/);
  });

  test('copy is routed through the translator, defaulting to the English key', () => {
    expect(rewardShopCatalog({ id: 'pro_7d', price: 1 })?.title).toBe('7 days of Pro');
    expect(rewardShopCatalog({ id: 'pro_7d', price: 1 }, (k) => `vi:${k}`)?.subtitle).toBe(
      'vi:Unlocked for a week',
    );
  });
});
