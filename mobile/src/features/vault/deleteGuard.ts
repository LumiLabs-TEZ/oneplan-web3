/**
 * A trip whose group wallet still holds USDC can't be deleted — the money would be stranded
 * on-chain. The server is the authority (`VaultSafetyService.assertTripDeletable`, 400
 * `vault_not_empty`); this pre-checks so the host sees why before the destructive confirm.
 */
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { Alert } from 'react-native';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import { fetchVaultBalance } from './api/queries';

/**
 * Fresh (never cached) vault balance read. Any failure — no vault, RPC down — answers `false`
 * so the normal confirm runs and the server decides.
 */
export async function vaultBlocksDelete(
  queryClient: QueryClient,
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<boolean> {
  try {
    const balance = await queryClient.fetchQuery({
      queryKey: keys.vault.balance(tripId),
      queryFn: () => fetchVaultBalance(tripId, api),
      meta: { persist: false },
      staleTime: 0,
    });
    return BigInt(balance.balanceMicro) > 0n;
  } catch {
    return false;
  }
}

export function isVaultNotEmptyError(err: unknown): boolean {
  if (!(err instanceof ApiMutationError) || err.status !== 400) return false;
  const body = err.body as { code?: unknown } | null;
  return body?.code === 'vault_not_empty';
}

export function alertVaultNotEmpty(t: TFunction): void {
  Alert.alert(
    t('Settle the group wallet first'),
    t("This trip's group wallet still holds money. Settle all payments before deleting the trip."),
  );
}
