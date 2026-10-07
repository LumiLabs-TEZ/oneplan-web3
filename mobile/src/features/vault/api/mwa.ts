/**
 * API calls for the Android MWA wallet (Solana Mobile hackathon build): SIWS-verified linking,
 * the devnet test-USDC faucet, and member Seeker identities. Same error contract as
 * `./mutations.ts` — these endpoints declare only their success response in Swagger, so server
 * error codes/statuses (e.g. 409 `wallet_locked_by_vault`, 429 `faucet_cooldown`) surface as
 * `ApiMutationError` (`status`, `body`, `classified`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';

export type SiwsChallengeDto = components['schemas']['SiwsChallengeDto'];
export type LinkWalletSiwsDto = components['schemas']['LinkWalletSiwsDto'];
export type FaucetClaimDto = components['schemas']['FaucetClaimDto'];
export type MemberIdentityDto = components['schemas']['MemberIdentityDto'];
type LinkWalletResponseDto = components['schemas']['LinkWalletResponseDto'];

export async function createSiwsChallenge(api: ApiClient = defaultApi): Promise<SiwsChallengeDto> {
  const { data, error, response } = await api.POST('/wallet/siws/challenge');
  // `error` is inferred as `never` (success-only Swagger), which narrows `response` to `never`
  // inside the branch — read `.status` outside it (same as `./mutations.ts`).
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

export async function linkWalletSiws(
  body: LinkWalletSiwsDto,
  api: ApiClient = defaultApi,
): Promise<LinkWalletResponseDto> {
  const { data, error, response } = await api.POST('/wallet/link/siws', { body });
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

export async function claimFaucet(api: ApiClient = defaultApi): Promise<FaucetClaimDto> {
  const { data, error, response } = await api.POST('/web3/faucet');
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

export function useClaimFaucet(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => claimFaucet(api),
    // The claim is a transfer into the wallet: a new history row as well as a new balance.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.wallet.balance }),
        queryClient.invalidateQueries({ queryKey: keys.wallet.history }),
      ]),
  });
}

export function useMemberIdentities(tripId: number) {
  return useQuery({
    queryKey: keys.vault.identities(tripId),
    queryFn: async () => {
      const { data, error, response } = await defaultApi.GET('/trips/{tripId}/vault/identities', {
        params: { path: { tripId } },
      });
      if (error !== undefined || !response.ok || !data) throw new ApiMutationError(response.status, error);
      return new Map(data.map((row) => [row.userId, row]));
    },
    // A Map is not JSON: never hand it to the MMKV persister.
    meta: { persist: false },
    enabled: Number.isFinite(tripId) && tripId > 0,
    staleTime: 10 * 60_000,
  });
}
