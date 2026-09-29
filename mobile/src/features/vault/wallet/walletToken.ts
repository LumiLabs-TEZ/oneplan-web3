/**
 * `GET /auth/wallet-token` — the short-lived RS256 JWT Privy exchanges for a wallet session
 * (`WalletService.swift`'s `walletToken()`, `origin/feat/web3-version`). Not part of the vault
 * read-query surface (`@/features/vault/api/queries.ts`) — this is auth plumbing consumed only
 * by `PrivyVaultProvider`'s `getCustomAccessToken`.
 */
import { api as defaultApi, type ApiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { HttpError } from '@/features/trip/api/queries';

export type WalletTokenDto = components['schemas']['WalletTokenDto'];

export async function fetchWalletToken(api: ApiClient = defaultApi): Promise<string> {
  const { data, error, response } = await api.GET('/auth/wallet-token');
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError('GET /auth/wallet-token', response.status, error ?? null);
  }
  return data.token;
}
