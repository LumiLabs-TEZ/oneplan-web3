/**
 * Personal-wallet withdraw endpoints — port of `WalletWithdrawService.swift`
 * (`origin/feat/web3-version`). Deliberately separate from `mutations.ts` (which is trip-scoped
 * vault setup/deposit): withdrawing is about the member's own money outside any trip, reached
 * from Settings, which does not belong to a trip at all.
 *
 * `useWallet`/`useWalletHistory` already live in `./queries.ts` (Wave A) — this file only adds
 * what queries.ts doesn't cover: inspecting a recipient and building/submitting a withdrawal.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';

export type InspectRecipientDto = components['schemas']['InspectRecipientDto'];
export type RecipientCheckDto = components['schemas']['RecipientCheckDto'];
export type BuildWithdrawalDto = components['schemas']['BuildWithdrawalDto'];
export type WithdrawalTxDto = components['schemas']['WithdrawalTxDto'];
export type SubmitSignedDto = components['schemas']['SubmitSignedDto'];
export type WithdrawalResultDto = components['schemas']['WithdrawalResultDto'];

/** Checks an address before an amount is chosen. `isNew` is a caution flag, never an error. */
export async function inspectWithdrawRecipient(
  address: string,
  api: ApiClient = defaultApi,
): Promise<RecipientCheckDto> {
  const { data, error, response } = await api.POST('/wallet/withdraw/recipient', {
    body: { address },
  });
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

export function useInspectWithdrawRecipient(api: ApiClient = defaultApi) {
  return useMutation({
    mutationFn: (address: string) => inspectWithdrawRecipient(address, api),
  });
}

/** Builds the unsigned withdrawal transaction for the caller to sign. Never submit unsigned. */
export async function buildWithdrawal(
  body: BuildWithdrawalDto,
  api: ApiClient = defaultApi,
): Promise<WithdrawalTxDto> {
  const { data, error, response } = await api.POST('/wallet/withdraw', { body });
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

/** Sends the signed withdrawal. Money moves the moment this call succeeds. */
export async function submitWithdrawal(
  body: SubmitSignedDto,
  api: ApiClient = defaultApi,
): Promise<WithdrawalResultDto> {
  const { data, error, response } = await api.POST('/wallet/withdraw/submit', { body });
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

export function useSubmitWithdrawal(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitSignedDto) => submitWithdrawal(body, api),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.wallet.balance }),
        queryClient.invalidateQueries({ queryKey: keys.wallet.history }),
      ]),
  });
}
