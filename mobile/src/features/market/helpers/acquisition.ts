import type { components } from '@/api/schema';
import { canSparkUnlock } from './sparkUnlockRules';

type ShopItem = components['schemas']['ShopItemStateDto'];
export function acquisitionAction(input: {
  owner: boolean;
  acquired: boolean;
  isPro: boolean;
  approved: boolean;
  shop?: ShopItem;
}): 'none' | 'apply' | 'acquire' | 'choose' | 'pro' {
  if (input.owner) return 'none';
  if (input.acquired) return 'apply';
  if (!input.approved) return 'none';
  if (input.isPro) return 'acquire';
  return canSparkUnlock({
    isPro: false,
    isOwnListing: false,
    hasApplied: false,
    listingApproved: input.approved,
    hasShopItem: input.shop?.available === true,
  })
    ? 'choose'
    : 'pro';
}
export function canAffordUnlock(balance: number, shop?: ShopItem) {
  return !!shop?.available && Number.isFinite(balance) && balance >= shop.price;
}
