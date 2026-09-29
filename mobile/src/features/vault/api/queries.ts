/**
 * Vault + personal-wallet reads (`TripVaultService`/`WalletWithdrawService` on iOS —
 * `origin/feat/web3-version`). Money-critical: never persisted (`meta.persist: false`), always
 * scoped by `tripId` so one trip's balance can never leak into another's cache
 * (`resetBalanceState(for:)`/`clearBalance()` in the Swift source — TanStack's `tripId`-keyed
 * query key is the equivalent guard here).
 */
import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';
import { HttpError } from '@/features/trip/api/queries';

export type VaultBalanceDto = components['schemas']['VaultBalanceDto'];
export type WalletBalanceDto = components['schemas']['WalletBalanceDto'];
export type VaultHistoryEntryDto = components['schemas']['VaultHistoryEntryDto'];
export type SettlementPreviewDto = components['schemas']['SettlementPreviewDto'];
export type WalletHistoryEntryDto = components['schemas']['WalletHistoryEntryDto'];
export type VaultTransactionDetailDto = components['schemas']['VaultTransactionDetailDto'];

export async function fetchVaultBalance(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<VaultBalanceDto> {
  const { data, error, response } = await api.GET('/trips/{tripId}/vault/balance', {
    params: { path: { tripId } },
  });
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(`GET /trips/${tripId}/vault/balance`, response.status, error ?? null);
  }
  return data;
}

/** Balance/response shape is 404-tolerant server-side (returns zeros before a vault exists). */
export function useVaultBalance(tripId: number, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.vault.balance(tripId),
    queryFn: () => fetchVaultBalance(tripId),
    meta: { persist: false },
    enabled: (opts.enabled ?? true) && Number.isFinite(tripId) && tripId > 0,
  });
}

/** The caller's own linked-wallet address + USDC balance, scoped to this trip's vault flow. */
export async function fetchMyVaultWallet(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<WalletBalanceDto> {
  const { data, error, response } = await api.GET('/trips/{tripId}/vault/wallet', {
    params: { path: { tripId } },
  });
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(`GET /trips/${tripId}/vault/wallet`, response.status, error ?? null);
  }
  return data;
}

export function useMyVaultWallet(tripId: number, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.vault.myWallet(tripId),
    queryFn: () => fetchMyVaultWallet(tripId),
    meta: { persist: false },
    enabled: (opts.enabled ?? true) && Number.isFinite(tripId) && tripId > 0,
  });
}

export async function fetchVaultHistory(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<VaultHistoryEntryDto[]> {
  const { data, error, response } = await api.GET('/trips/{tripId}/vault/history', {
    params: { path: { tripId } },
  });
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(`GET /trips/${tripId}/vault/history`, response.status, error ?? null);
  }
  return data;
}

export function useVaultHistory(tripId: number, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.vault.history(tripId),
    queryFn: () => fetchVaultHistory(tripId),
    meta: { persist: false },
    enabled: (opts.enabled ?? true) && Number.isFinite(tripId) && tripId > 0,
  });
}

/** Full receipt for one vault payment (`VaultHistoryView` row tap, SPEND rows only). */
export async function fetchVaultTransaction(
  tripId: number,
  vaultTransactionId: number,
  api: ApiClient = defaultApi,
): Promise<VaultTransactionDetailDto> {
  const { data, error, response } = await api.GET(
    '/trips/{tripId}/vault/pay/{vaultTransactionId}',
    {
      params: { path: { tripId, vaultTransactionId } },
    },
  );
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(
      `GET /trips/${tripId}/vault/pay/${vaultTransactionId}`,
      response.status,
      error ?? null,
    );
  }
  return data;
}

export function useVaultTransaction(
  tripId: number,
  vaultTransactionId: number | null,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: keys.vault.transaction(tripId, vaultTransactionId ?? 0),
    queryFn: () => fetchVaultTransaction(tripId, vaultTransactionId as number),
    meta: { persist: false },
    enabled:
      (opts.enabled ?? true) &&
      Number.isFinite(tripId) &&
      tripId > 0 &&
      vaultTransactionId !== null,
  });
}

export async function fetchVaultSettlement(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<SettlementPreviewDto> {
  const { data, error, response } = await api.GET('/trips/{tripId}/vault/settlement', {
    params: { path: { tripId } },
  });
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(`GET /trips/${tripId}/vault/settlement`, response.status, error ?? null);
  }
  return data;
}

export function useVaultSettlement(tripId: number, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.vault.settlement(tripId),
    queryFn: () => fetchVaultSettlement(tripId),
    meta: { persist: false },
    enabled: (opts.enabled ?? true) && Number.isFinite(tripId) && tripId > 0,
  });
}

/** Personal OnePlan Wallet — not trip-scoped (`GET /wallet`). */
export async function fetchWallet(api: ApiClient = defaultApi): Promise<WalletBalanceDto> {
  const { data, error, response } = await api.GET('/wallet');
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError('GET /wallet', response.status, error ?? null);
  }
  return data;
}

export function useWallet(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.wallet.balance,
    queryFn: () => fetchWallet(),
    meta: { persist: false },
    enabled: opts.enabled ?? true,
  });
}

export async function fetchWalletHistory(
  api: ApiClient = defaultApi,
): Promise<WalletHistoryEntryDto[]> {
  const { data, error, response } = await api.GET('/wallet/history');
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError('GET /wallet/history', response.status, error ?? null);
  }
  return data;
}

export function useWalletHistory(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.wallet.history,
    queryFn: () => fetchWalletHistory(),
    meta: { persist: false },
    enabled: opts.enabled ?? true,
  });
}
