/**
 * Port of `TripVaultService.deposit(tripId:amountMicro:)` (`origin/feat/web3-version`): the
 * concrete build→verify→sign→submit flow for moving USDC from the caller's personal OnePlan
 * Wallet into the trip vault. Composes `@/features/vault/api` (build/submit) with the generic
 * `signAndSubmit` pipeline and the hard-coded on-chain expectations from
 * `@/features/vault/solana/constants`.
 *
 * A trip with no vault yet gets one here — there is no separate "enable vault" step (lazy,
 * idempotent `createVault`).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import {
  buildVaultDeposit,
  createVault,
  linkVaultWallet,
  submitVaultDeposit,
  type DepositResultDto,
} from '../api/mutations';
import { fetchVaultBalance } from '../api/queries';
import { VAULT_DISCRIMINATORS, VAULT_PROGRAM_ID, VAULT_USDC_MINT } from '../solana/constants';
import { deriveAssociatedTokenAddress, deriveVaultPda } from '../solana/pda';
import { verify } from '../solana/transactionVerifier';
import { ensureVaultWallet } from '../wallet/walletHandle';
import { signAndSubmit } from './pipeline';

/** Matches `CreateVaultDto`'s own `@default`s (server/src/trip-vault DTOs) — a fresh vault. */
export const DEFAULT_VAULT_THRESHOLD_MICRO = '3000000';
export const DEFAULT_VAULT_DAILY_LIMIT_MICRO = '100000000';

export interface DepositToVaultDeps {
  api?: ApiClient;
  /** Injectable for tests; defaults to the live Privy wallet. */
  sign?: (base64Tx: string) => Promise<string>;
}

export async function depositToVault(
  tripId: number,
  amountMicro: bigint,
  deps: DepositToVaultDeps = {},
): Promise<DepositResultDto> {
  const api = deps.api ?? defaultApi;

  const publicKey = await ensureVaultWallet();
  await linkVaultWallet(tripId, { publicKey }, api);
  await createVault(
    tripId,
    {
      thresholdMicro: DEFAULT_VAULT_THRESHOLD_MICRO,
      dailyLimitMicro: DEFAULT_VAULT_DAILY_LIMIT_MICRO,
    },
    api,
  );

  // Refresh the treasury account right before verifying — it is the one account the check still
  // takes from the server (see the TODO below), so a stale read would defeat verifying it.
  const balance = await fetchVaultBalance(tripId, api);
  // The signer is the local Privy key (`publicKey` above), and its USDC account is derived from
  // it — never the `owner`/`ownerAta` the server's wallet response reports (S-4b, review C1).
  const owner = publicKey;
  const ownerAta = deriveAssociatedTokenAddress(owner, VAULT_USDC_MINT);

  const { base64Tx: unsignedTx } = await buildVaultDeposit(
    tripId,
    { amountMicro: amountMicro.toString() },
    api,
  );

  // Derived client-side rather than trusted from `balance` (security audit S-4b): the verifier
  // must bind what the client itself can compute from the immutable on-chain seeds
  // (VAULT_PROGRAM_ID + tripId, then the SPL ATA formula), not accounts the server merely
  // echoes back as "expected" — a compromised or buggy server could otherwise report its own
  // attacker-chosen vault/ATA and have this check wave it through.
  const vaultPda = deriveVaultPda(tripId, VAULT_PROGRAM_ID);
  const vaultUsdcAta = deriveAssociatedTokenAddress(vaultPda, VAULT_USDC_MINT);
  // TODO(security): treasuryAta is NOT independently derivable client-side — its owner is either
  // the server's fee-payer keypair or an operator-set `SOLANA_TREASURY_OWNER` override
  // (server/src/solana/solana.service.ts `treasuryOwner()`), neither of which the client has a
  // trustworthy source for today. Pin this once the server exposes the treasury owner through a
  // signed/versioned config endpoint (or once it becomes a fixed per-env constant) rather than
  // trusting the same balance response the deposit itself is being verified against.
  const treasuryAta = balance.treasuryAta;

  return signAndSubmit({
    unsignedTx,
    verify: () =>
      verify({
        base64: unsignedTx,
        expectedProgramId: VAULT_PROGRAM_ID,
        expectedDiscriminator: VAULT_DISCRIMINATORS.deposit,
        expectedAmountMicro: amountMicro,
        expectedAccounts: [vaultPda, vaultUsdcAta, treasuryAta, owner, ownerAta],
      }),
    sign: deps.sign,
    submit: (signedTx) =>
      submitVaultDeposit(tripId, { signedTx, amountMicro: amountMicro.toString() }, api),
  });
}

/** Screen-facing mutation: same cache invalidation as `useSubmitVaultDeposit`. */
export function useDepositToVault(tripId: number, deps: DepositToVaultDeps = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amountMicro: bigint) => depositToVault(tripId, amountMicro, deps),
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
