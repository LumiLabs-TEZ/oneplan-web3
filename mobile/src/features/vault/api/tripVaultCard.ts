import { useConvertedAmount } from '@/features/exchange/useExchangeRate';

import { useWeb3Enabled } from '../web3Flag';
import { useVaultBalance } from './queries';

/**
 * Whether trip detail shows the vault card in place of the classic `HomeCard`, plus the vault
 * balance converted into the trip's home currency for it.
 *
 * `useVaultBalance` 404s for a trip with no vault, the ordinary case, matching
 * `TripVaultService.hasVault(tripId:)`'s own reasoning for reusing the balance endpoint. Flag OFF →
 * `hasVaultCard === false` → `HomeCard`.
 *
 * The USD→home conversion is requested only once the card actually shows: `useConvertedAmount`
 * fires `GET /exchange-rates` whenever `from` is set and differs from `to`, and develop makes no
 * such call on trip open (final-review H1) — so the source currency is `null` until there is a
 * vault card.
 */
export function useTripVaultCard(
  tripId: number,
  homeCurrencyCode: string,
): { hasVaultCard: boolean; balanceInHomeCurrency: number } {
  const web3Enabled = useWeb3Enabled();
  const vaultBalance = useVaultBalance(tripId, { enabled: web3Enabled });
  const hasVaultCard = web3Enabled && vaultBalance.isSuccess;
  const balanceUsdc = hasVaultCard
    ? Number(BigInt(vaultBalance.data.balanceMicro)) / 1_000_000
    : 0;
  const converted = useConvertedAmount(balanceUsdc, hasVaultCard ? 'USD' : null, homeCurrencyCode);
  return { hasVaultCard, balanceInHomeCurrency: converted.amount ?? 0 };
}
