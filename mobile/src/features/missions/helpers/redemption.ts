import type { Overview, RedeemInput, Redemption } from '../api/queries';
export type ShopRewardId = Exclude<RedeemInput['itemId'], 'market_unlock'>;
export type RedemptionErrorCode = 'busy' | 'offline' | 'invalid_quantity' | 'unavailable';
/** Client-side refusal to write. Screens translate `code`; the message is not user-facing. */
export class RedemptionError extends Error {
  constructor(readonly code: RedemptionErrorCode) {
    super(code);
    this.name = 'RedemptionError';
  }
}
export interface RedemptionRun {
  confirmed: Redemption[];
  error?: unknown;
}
/** One ledger request per credit. A fresh overview is mandatory before every explicit attempt,
 * including after a lost response. Never retry a write whose outcome is unknown. */
export class RedemptionRunner {
  private busy = false;
  async run(
    itemId: ShopRewardId,
    quantity: number,
    deps: {
      overview: () => Promise<Overview>;
      redeem: (body: RedeemInput) => Promise<Redemption>;
      online: () => boolean;
    },
  ): Promise<RedemptionRun> {
    if (this.busy) throw new RedemptionError('busy');
    this.busy = true;
    const confirmed: Redemption[] = [];
    try {
      if (!deps.online()) throw new RedemptionError('offline');
      if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        (itemId !== 'scan_credit_1' && quantity !== 1)
      )
        throw new RedemptionError('invalid_quantity');
      const overview = await deps.overview();
      const item = overview.shopItems.find((value) => value.itemId === itemId);
      if (!item?.available || overview.balance < item.price * quantity)
        throw new RedemptionError('unavailable');
      for (let index = 0; index < quantity; index++) {
        if (!deps.online()) throw new RedemptionError('offline');
        confirmed.push(await deps.redeem({ itemId }));
      }
      return { confirmed };
    } catch (error) {
      return { confirmed, error };
    } finally {
      this.busy = false;
    }
  }
}
