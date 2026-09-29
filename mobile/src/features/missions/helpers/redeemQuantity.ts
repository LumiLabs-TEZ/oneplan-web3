// Pure redeem math for the redeem-quantity sheet: what the picked quantity
// costs, whether the balance covers it, and whether the item allows stepping
// at all. Ported from `RedeemQuantityModel` in
// ios OnePlan/Component/BottomSheet/RedeemRewardBottomSheet.swift.

/** The only reward-shop item whose quantity can be stepped; others are fixed at 1. */
export const STEPPABLE_ITEM_ID = 'scan_credit_1';

export interface RedeemQuantityInputs {
  price: number;
  quantity: number;
  balance: number;
  itemId: string;
}

export interface RedeemQuantityModel {
  /** price × quantity */
  total: number;
  /** How many ⚡ the user is missing; 0 when affordable. */
  shortfall: number;
  canAfford: boolean;
  /** Quantity stepping only applies to the scan-credit item. */
  steppable: boolean;
}

export function redeemQuantity({
  price,
  quantity,
  balance,
  itemId,
}: RedeemQuantityInputs): RedeemQuantityModel {
  const total = price * quantity;
  const shortfall = Math.max(0, total - balance);
  return {
    total,
    shortfall,
    canAfford: shortfall === 0,
    steppable: itemId === STEPPABLE_ITEM_ID,
  };
}
