import { useMissions } from '@/features/missions/api/queries';
import { useIsPro } from '@/features/subscription/api/queries';

/**
 * Spark price of the `market_unlock` shop item shown on a listing card's CTA for free users;
 * `undefined` for Pro (or while unavailable) so the card falls back to "Unlock & Apply".
 */
export function useMarketSparkPrice(): number | undefined {
  const isPro = useIsPro();
  const rewards = useMissions();
  return isPro
    ? undefined
    : rewards.data?.shopItems.find((i) => i.itemId === 'market_unlock' && i.available)?.price;
}
