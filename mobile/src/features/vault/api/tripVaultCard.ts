import { useConvertedAmount } from '@/features/exchange/useExchangeRate';

import { useWeb3Enabled } from '../web3Flag';
import { useVaultBalance } from './queries';

/**
 * Whether trip detail shows the vault card in place of the classic `HomeCard`, plus the vault
 * balance converted into the trip's home currency for it.
 *
 * Every web3 trip shows the card (iOS `TripDetailView`: "Vault card is always shown … created
 * lazily on the first deposit — until then the balance is 0"), so a fresh trip has a Deposit
 * entry. `hasVault` is the separate "a vault exists" answer: `useVaultBalance` 404s until the
 * first deposit, matching `TripVaultService.hasVault(tripId:)`'s reasoning for reusing the balance
 * endpoint. Flag OFF → `hasVaultCard === false` → `HomeCard`.
 *
 * The USD→home conversion is requested only once the card actually shows: `useConvertedAmount`
 * fires `GET /exchange-rates` whenever `from` is set and differs from `to`, and develop makes no
 * such call on trip open (final-review H1) — so the source currency is `null` until there is a
 * vault.
 */
export function useTripVaultCard(
  tripId: number,
  homeCurrencyCode: string,
): { hasVaultCard: boolean; hasVault: boolean; balanceInHomeCurrency: number } {
  const web3Enabled = useWeb3Enabled(tripId);
  const vaultBalance = useVaultBalance(tripId, { enabled: web3Enabled });
  const hasVault = web3Enabled && vaultBalance.isSuccess;
  const balanceUsdc = hasVault ? Number(BigInt(vaultBalance.data.balanceMicro)) / 1_000_000 : 0;
  const converted = useConvertedAmount(balanceUsdc, hasVault ? 'USD' : null, homeCurrencyCode);
  return { hasVaultCard: web3Enabled, hasVault, balanceInHomeCurrency: converted.amount ?? 0 };
}
