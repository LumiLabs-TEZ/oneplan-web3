/**
 * Vault setup + wallet-link + deposit mutations. Pay/quote/approve/cancel is Wave B's
 * `api/pay.ts` (`docs/web3/rn-ui-parity-inventory.md` — `trip-vault-service` row: this file
 * covers everything except that chain).
 *
 * Deposit is a two-step build→sign→submit flow: `useBuildVaultDeposit` returns an unsigned
 * base64 transaction; the caller runs it through the signing pipeline
 * (`@/features/vault/signing`) — which verifies the built transaction against what the user
 * confirmed on screen before ever calling Privy — then `useSubmitVaultDeposit` posts the signed
 * transaction back. Never sign+submit without that verification step in between.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';

export type CreateVaultDto = components['schemas']['CreateVaultDto'];
export type VaultCreatedDto = components['schemas']['VaultCreatedDto'];
export type SyncMembersResultDto = components['schemas']['SyncMembersResultDto'];
export type LinkWalletDto = components['schemas']['LinkWalletDto'];
export type LinkWalletResponseDto = components['schemas']['LinkWalletResponseDto'];
export type DepositRequestDto = components['schemas']['DepositRequestDto'];
export type UnsignedTxDto = components['schemas']['UnsignedTxDto'];
export type SubmitDepositDto = components['schemas']['SubmitDepositDto'];
export type DepositResultDto = components['schemas']['DepositResultDto'];
export type UpdateVaultSpendDto = components['schemas']['UpdateVaultSpendDto'];
export type VaultTransactionDetailDto = components['schemas']['VaultTransactionDetailDto'];

/** Lazily creates the trip's on-chain vault (idempotent — safe to call before every deposit). */
export async function createVault(
  tripId: number,
  body: CreateVaultDto,
  api: ApiClient = defaultApi,
): Promise<VaultCreatedDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/vault', {
    params: { path: { tripId } },
    body,
  });
  // These web3 endpoints only declare their success response in Swagger (no `@ApiResponse`
  // error variants), so openapi-typescript infers `error: never` and TS treats the `if` body as
  // unreachable, narrowing `response` itself to `never` inside it. Read `.status` outside the
  // branch so it keeps its real type.
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

export function useCreateVault(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVaultDto) => createVault(tripId, body, api),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.vault.balance(tripId) }),
  });
}

/** Adds every accepted trip member to the vault on chain. Self-sync also happens on link. */
export async function syncVaultMembers(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<SyncMembersResultDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/vault/members/sync', {
    params: { path: { tripId } },
  });
  // These web3 endpoints only declare their success response in Swagger (no `@ApiResponse`
  // error variants), so openapi-typescript infers `error: never` and TS treats the `if` body as
  // unreachable, narrowing `response` itself to `never` inside it. Read `.status` outside the
  // branch so it keeps its real type.
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

/** Trip-scoped wallet link — used from vault screens that already have a `tripId` in hand. */
export async function linkVaultWallet(
  tripId: number,
  body: LinkWalletDto,
  api: ApiClient = defaultApi,
): Promise<LinkWalletResponseDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/vault/wallet', {
    params: { path: { tripId } },
    body,
  });
  // These web3 endpoints only declare their success response in Swagger (no `@ApiResponse`
  // error variants), so openapi-typescript infers `error: never` and TS treats the `if` body as
  // unreachable, narrowing `response` itself to `never` inside it. Read `.status` outside the
  // branch so it keeps its real type.
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

export function useLinkVaultWallet(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LinkWalletDto) => linkVaultWallet(tripId, body, api),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.vault.myWallet(tripId) }),
        queryClient.invalidateQueries({ queryKey: keys.vault.balance(tripId) }),
      ]),
  });
}

/**
 * Account-wide wallet link (`POST /wallet/link`) — what the Privy wallet provider's
 * `ensureLinked()` calls on sign-in bootstrap, before any trip is in context.
 */
export async function linkWallet(
  body: LinkWalletDto,
  api: ApiClient = defaultApi,
): Promise<LinkWalletResponseDto> {
  const { data, error, response } = await api.POST('/wallet/link', { body });
  // These web3 endpoints only declare their success response in Swagger (no `@ApiResponse`
  // error variants), so openapi-typescript infers `error: never` and TS treats the `if` body as
  // unreachable, narrowing `response` itself to `never` inside it. Read `.status` outside the
  // branch so it keeps its real type.
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

export function useLinkWallet(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LinkWalletDto) => linkWallet(body, api),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.wallet.balance }),
  });
}

/** Builds an unsigned deposit transaction for the caller to sign. Never submit without signing. */
export async function buildVaultDeposit(
  tripId: number,
  body: DepositRequestDto,
  api: ApiClient = defaultApi,
): Promise<UnsignedTxDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/vault/deposit', {
    params: { path: { tripId } },
    body,
  });
  // These web3 endpoints only declare their success response in Swagger (no `@ApiResponse`
  // error variants), so openapi-typescript infers `error: never` and TS treats the `if` body as
  // unreachable, narrowing `response` itself to `never` inside it. Read `.status` outside the
  // branch so it keeps its real type.
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

export function useBuildVaultDeposit(tripId: number, api: ApiClient = defaultApi) {
  return useMutation({
    mutationFn: (body: DepositRequestDto) => buildVaultDeposit(tripId, body, api),
  });
}

/** Submits the client-signed deposit transaction. Money moves the moment this call succeeds. */
export async function submitVaultDeposit(
  tripId: number,
  body: SubmitDepositDto,
  api: ApiClient = defaultApi,
): Promise<DepositResultDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/vault/deposit/submit', {
    params: { path: { tripId } },
    body,
  });
  // These web3 endpoints only declare their success response in Swagger (no `@ApiResponse`
  // error variants), so openapi-typescript infers `error: never` and TS treats the `if` body as
  // unreachable, narrowing `response` itself to `never` inside it. Read `.status` outside the
  // branch so it keeps its real type.
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

export function useSubmitVaultDeposit(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitDepositDto) => submitVaultDeposit(tripId, body, api),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.vault.balance(tripId) }),
        queryClient.invalidateQueries({ queryKey: keys.vault.history(tripId) }),
        queryClient.invalidateQueries({ queryKey: keys.vault.myWallet(tripId) }),
        queryClient.invalidateQueries({ queryKey: keys.wallet.balance }),
        queryClient.invalidateQueries({ queryKey: keys.wallet.history }),
      ]),
  });
}

/**
 * Edits name / category / share on a confirmed vault spend. Amount is intentionally not a field
 * here at all — the on-chain transfer already happened (`VaultTransactionEditView`, `amount is
 * locked`).
 */
export async function updateVaultSpend(
  tripId: number,
  vaultTransactionId: number,
  body: UpdateVaultSpendDto,
  api: ApiClient = defaultApi,
): Promise<VaultTransactionDetailDto> {
  const { data, error, response } = await api.PATCH(
    '/trips/{tripId}/vault/pay/{vaultTransactionId}',
    {
      params: { path: { tripId, vaultTransactionId } },
      body,
    },
  );
  const status = response.status;
  if (error || !data) throw new ApiMutationError(status, error);
  return data;
}

export function useUpdateVaultSpend(
  tripId: number,
  vaultTransactionId: number,
  api: ApiClient = defaultApi,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateVaultSpendDto) =>
      updateVaultSpend(tripId, vaultTransactionId, body, api),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: keys.vault.transaction(tripId, vaultTransactionId),
        }),
        queryClient.invalidateQueries({ queryKey: keys.vault.history(tripId) }),
      ]),
  });
}
