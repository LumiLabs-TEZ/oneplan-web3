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

/** Backoff before each retry; one entry per retry after the first attempt. */
const WALLET_TOKEN_RETRY_DELAYS_MS = [300, 1_000];

let lastFailure: string | null = null;

/** Why the most recent `fetchWalletTokenWithRetry` gave up, or null if it last succeeded. */
export function lastWalletTokenFailure(): string | null {
  return lastFailure;
}

function describeTokenFailure(error: unknown): string {
  if (error instanceof HttpError) return `HTTP ${error.status}`;
  return error instanceof Error ? error.message : String(error);
}

/**
 * `fetchWalletToken`, retried on failure. Privy's custom-auth effect logs the Privy session out
 * whenever the token getter comes back empty while a Privy user exists, so a single network blip
 * here used to drop the wallet session until something else re-triggered a login — retry before
 * letting that happen. Rejects with the last error once every attempt has failed.
 */
export async function fetchWalletTokenWithRetry(
  api: ApiClient = defaultApi,
  delaysMs: readonly number[] = WALLET_TOKEN_RETRY_DELAYS_MS,
): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const token = await fetchWalletToken(api);
      lastFailure = null;
      return token;
    } catch (error) {
      lastFailure = describeTokenFailure(error);
      const delay = delaysMs[attempt];
      if (delay === undefined) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** Test-only. */
export function _resetWalletTokenFailureForTests(): void {
  lastFailure = null;
}
