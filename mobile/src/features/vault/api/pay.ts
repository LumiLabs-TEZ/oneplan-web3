/**
 * Pay/quote/approve/cancel orchestration — port of the `// MARK: - Pay` section of
 * `ios/OnePlan/OnePlan/Services/TripVaultService.swift` (`feat/web3-version`): `lookupRecipient`,
 * `quote`, `pay`/`complete`, `approve`, `cancel`.
 *
 * Wired through Wave A's generic `signAndSubmit` pipeline (`../signing/pipeline.ts`) — never signs
 * or submits by hand. `fetchVaultBalance` (`../api/queries.ts`) is read ONCE, before `prepare`, and
 * that same reading is reused for every `verify()` closure in the call — never re-fetched after
 * `prepare` answers, so a compromised `prepare` response can't retarget the destination the check
 * runs against (S-4/S-4b: bind to what was read/confirmed before asking the server to act, not to
 * anything the server hands back afterward).
 *
 * Amount binding (S-4/S-4b, audit-flagged merge-gate fix): `spend`/`proposeSpend` both encode a
 * `u64 amount` in the instruction (`server/src/solana/idl/oneplan_vault.json` — `spend`/
 * `propose_spend` args), so the amount IS checkable at the byte level and must never be
 * `expectedAmountMicro: null`. `payVault` calls `quoteVaultPayment` itself, immediately before
 * `prepare`, using only the qrPayload + amountVnd the user already confirmed on
 * `VaultPayAmountScreen` — never anything `prepare` echoes — and pins that quote's
 * `amountUsdcMicro` as `confirmedAmountMicro`. `prepared.amountUsdcMicro` is then asserted equal to
 * it (mismatch aborts + abandons) and `confirmedAmountMicro` — not `prepared.amountUsdcMicro` — is
 * what every `verify()`/`verifyTokenTransfer()` call checks the signed bytes against. This does not
 * require a dedicated "confirm the USDC quote" screen to exist yet (none is built): the quote is
 * derived solely from user-entered inputs, so no single server response is ever trusted alone —
 * `quote` and `prepare` must independently agree, and the final signed instruction bytes must match
 * both.
 *
 * `approve_spend` and `cancel_spend` take ZERO instruction args (same IDL) — there is no amount
 * byte to bind for either, by design of the on-chain program: the amount is fixed once, at
 * `propose_spend` time (which this file already verifies), and cannot be altered by a later
 * approve/cancel. `expectedAmountMicro: null` for those two is therefore correct, not an omission —
 * passing a non-null value there would always fail `verify()` (there is nothing at those bytes to
 * compare).
 *
 * `quote` and `prepare` agreeing is not, on its own, proof of anything: both responses come from
 * the same server, so a fully compromised server could return a consistent-but-inflated pair and
 * the equality check alone would not notice. `assertFxSanityBound` is the check that does not trust
 * either response — it rejects a quote whose implied VND/USDC rate falls outside
 * `FX_VND_PER_USDC_MIN..MAX` (`../solana/constants.ts`), a band derived from nothing the server
 * sends. This still does not fully close the gap (a compromised server could return a plausible-but-
 * still-wrong amount inside the band); the underlying issue is that no screen yet shows the user the
 * USDC amount to confirm before paying — see the `TODO(security)` on `payVault` below.
 *
 * TODO(security): the payout receiver ATA (`spendRecipientAta`, via `requireSpendRecipientAta`
 * below) is likewise still read from the server rather than derived from a pinned owner constant —
 * see that function's own `TODO(security)` for why. Both TODOs are also logged in
 * `docs/web3/rn-ui-parity-inventory.json` (`vault-pay-and-approve-orchestration` row) so whoever
 * builds the pay confirm/receipt screen and whoever exposes the receiver owner pubkey can close
 * them.
 *
 * Client-derived accounts (S-4b, final-review C1): the vault PDA, the vault's USDC ATA and the
 * signer's own USDC ATA are derived locally (`deriveVaultPda` / `deriveAssociatedTokenAddress`,
 * `../solana/pda.ts`) — never taken from `VaultBalanceDto`/`prepared.payerAta`. Only the payout
 * receiver ATA still comes from the server (TODO above).
 *
 * `TransactionVerifier`/`verifyTokenTransfer` (already ported: `../solana/transactionVerifier.ts`)
 * are reused verbatim — this file never re-implements the byte-level checks.
 */
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { classifyError, type ClassifiedError } from '@/api/errors';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';

import { fetchVaultBalance, type VaultBalanceDto } from '../api/queries';
import { signAndSubmit } from '../signing/pipeline';
import {
  FX_VND_PER_USDC_MAX,
  FX_VND_PER_USDC_MIN,
  VAULT_DISCRIMINATORS,
  VAULT_PROGRAM_ID,
  VAULT_USDC_MINT,
} from '../solana/constants';
import { deriveAssociatedTokenAddress, deriveVaultPda } from '../solana/pda';
import { verify, verifyTokenTransfer } from '../solana/transactionVerifier';
import { ensureVaultWallet } from '../wallet/walletHandle';

type VaultTxSource = components['schemas']['VaultTxSource'];
type ExpenseCategory = components['schemas']['ExpenseCategory'];
type RecipientDto = components['schemas']['RecipientDto'];
type PayQuoteDto = components['schemas']['PayQuoteDto'];
type PreparePaymentResponseDto = components['schemas']['PreparePaymentResponseDto'];
type SubmitResultDto = components['schemas']['SubmitResultDto'];

export class VaultPayError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly classified: ClassifiedError;

  constructor(status: number, body: unknown) {
    const classified = classifyError(body, { status });
    super(classified.message);
    this.name = 'VaultPayError';
    this.status = status;
    this.body = body;
    this.classified = classified;
  }
}

/** User-facing message for any thrown vault-pay error. */
export function vaultPayErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof VaultPayError) return err.classified.message || fallback;
  return classifyError(err).message || fallback;
}

// ---------------------------------------------------------------------------
// Raw API calls (Swift: `TripVaultService.lookupRecipient/quote/pay/approve/cancel`)
// ---------------------------------------------------------------------------

/** Who a scanned code pays, before any amount is known. */
export async function lookupVaultRecipient(
  tripId: number,
  qrPayload: string,
  api: ApiClient = defaultApi,
): Promise<RecipientDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/vault/pay/recipient', {
    params: { path: { tripId } },
    body: { qrPayload },
  });
  if (error || !response.ok || !data) throw new VaultPayError(response.status, error);
  return data;
}

export interface QuoteVaultPaymentParams {
  qrPayload: string;
  /** Decimal string. Required when the QR carries no amount. */
  amountVnd?: string;
  source?: VaultTxSource;
}

export async function quoteVaultPayment(
  tripId: number,
  params: QuoteVaultPaymentParams,
  api: ApiClient = defaultApi,
): Promise<PayQuoteDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/vault/pay/quote', {
    params: { path: { tripId } },
    body: params,
  });
  if (error || !response.ok || !data) throw new VaultPayError(response.status, error);
  return data;
}

export interface PayRequest {
  /** Raw EMVCo payload scanned from the VietQR code. */
  qrPayload: string;
  /** Decimal string. What the user confirmed on `VaultPayAmountScreen`. */
  amountVnd?: string;
  name: string;
  category: ExpenseCategory;
  /** Empty means everyone shares. */
  shareWithUserIds: number[];
  /** VAULT (default): the group wallet pays. PERSONAL: the caller's own wallet pays. */
  source?: VaultTxSource;
}

async function prepareVaultPayment(
  tripId: number,
  request: PayRequest,
  api: ApiClient = defaultApi,
): Promise<PreparePaymentResponseDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/vault/pay/prepare', {
    params: { path: { tripId } },
    body: {
      qrPayload: request.qrPayload,
      amountVnd: request.amountVnd,
      name: request.name,
      category: request.category,
      shareWithUserIds: request.shareWithUserIds,
      source: request.source,
    },
  });
  if (error || !response.ok || !data) throw new VaultPayError(response.status, error);
  return data;
}

async function submitVaultPayment(
  tripId: number,
  vaultTransactionId: number,
  signedTx: string,
  api: ApiClient = defaultApi,
): Promise<SubmitResultDto> {
  const { data, error, response } = await api.POST(
    '/trips/{tripId}/vault/pay/{vaultTransactionId}/submit',
    {
      params: { path: { tripId, vaultTransactionId } },
      body: { signedTx },
    },
  );
  if (error || !response.ok || !data) throw new VaultPayError(response.status, error);
  return data;
}

/** Tells the server a prepared payment will not be signed. Never call once a signature exists. */
async function abandonVaultPayment(
  tripId: number,
  vaultTransactionId: number,
  api: ApiClient = defaultApi,
): Promise<void> {
  const { error, response } = await api.POST('/trips/{tripId}/vault/pay/{vaultTransactionId}/abandon', {
    params: { path: { tripId, vaultTransactionId } },
  });
  if (error || !response.ok) throw new VaultPayError(response.status, error);
}

async function buildApproveVaultPayment(
  tripId: number,
  vaultTransactionId: number,
  api: ApiClient = defaultApi,
): Promise<{ base64Tx: string }> {
  const { data, error, response } = await api.POST(
    '/trips/{tripId}/vault/pay/{vaultTransactionId}/approve',
    { params: { path: { tripId, vaultTransactionId } } },
  );
  if (error || !response.ok || !data) throw new VaultPayError(response.status, error);
  return data;
}

async function buildCancelVaultPayment(
  tripId: number,
  vaultTransactionId: number,
  api: ApiClient = defaultApi,
): Promise<{ base64Tx: string }> {
  const { data, error, response } = await api.POST(
    '/trips/{tripId}/vault/pay/{vaultTransactionId}/cancel',
    { params: { path: { tripId, vaultTransactionId } } },
  );
  if (error || !response.ok || !data) throw new VaultPayError(response.status, error);
  return data;
}

async function submitVaultPaymentCancel(
  tripId: number,
  vaultTransactionId: number,
  signedTx: string,
  api: ApiClient = defaultApi,
): Promise<void> {
  const { error, response } = await api.POST(
    '/trips/{tripId}/vault/pay/{vaultTransactionId}/cancel/submit',
    {
      params: { path: { tripId, vaultTransactionId } },
      body: { signedTx },
    },
  );
  if (error || !response.ok) throw new VaultPayError(response.status, error);
}

// ---------------------------------------------------------------------------
// Orchestration (Swift: `complete`/`signAndSubmit`/`signAndSubmitPersonal`)
// ---------------------------------------------------------------------------

export type PayOutcome =
  /** Paid out and recorded as an expense. */
  | { kind: 'confirmed'; vaultTransactionId: number }
  /** Submitted; the payout provider has not answered yet. The server's reconcile job resolves it — never retry. */
  | { kind: 'pending'; vaultTransactionId: number }
  /** Above the trip's threshold. Another member has to approve before it moves. */
  | { kind: 'awaitingApproval'; vaultTransactionId: number };

function outcomeFromStatus(status: string, vaultTransactionId: number): PayOutcome {
  return status === 'CONFIRMED'
    ? { kind: 'confirmed', vaultTransactionId }
    : { kind: 'pending', vaultTransactionId };
}

/**
 * `VaultBalanceDto.spendRecipientAta` is absent when the server's payout receiver isn't configured
 * — every spend-shaped instruction needs it, so refuse early rather than let `verify()` fail on a
 * `null` account.
 *
 * TODO(security): this ATA is still read from `fetchVaultBalance` (a value the server hands back),
 * not derived client-side from a pinned owner constant the way withdrawal recipients are
 * (`../wallet/associatedTokenAddress.ts`, S-4/S-4b). The receiver's OWNER pubkey — needed to
 * derive the ATA independently — is not exposed anywhere yet (`VaultBalanceDto` only carries the
 * ATA itself, no owner field, and no constant for it exists in `../solana/constants.ts`). Until
 * that owner is exposed (or hard-coded as a constant, if it's a single fixed environment wallet),
 * the best available mitigation is what every caller in this file already does: read this value
 * ONCE, before calling `prepare`/build-tx, and reuse that single reading for every `verify()` in
 * the same call — never re-fetched after the server has seen the request, so `prepare` itself
 * cannot retarget it.
 */
function requireSpendRecipientAta(balance: VaultBalanceDto): string {
  if (!balance.spendRecipientAta) {
    throw new Error('Vault payout receiver is not configured for this trip');
  }
  return balance.spendRecipientAta;
}

/** The accounts every vault instruction is pinned to, derived from the immutable on-chain seeds. */
function deriveVaultAccounts(tripId: number): { vaultPda: string; vaultUsdcAta: string } {
  const vaultPda = deriveVaultPda(tripId, VAULT_PROGRAM_ID);
  return { vaultPda, vaultUsdcAta: deriveAssociatedTokenAddress(vaultPda, VAULT_USDC_MINT) };
}

/**
 * `prepare` and `quote` are two independent server calls; this class marks a case where they (or
 * the source the server prepared) disagree with each other or with what the caller asked for — a
 * signal to abandon rather than sign, never a case to retry with the server's number.
 */
export class VaultPaySecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultPaySecurityError';
  }
}

/**
 * Rejects a quoted USDC amount whose implied VND/USDC rate falls outside
 * `FX_VND_PER_USDC_MIN..MAX` (`../solana/constants.ts`). `amountVndStr` must be the VND the caller
 * itself supplied (`PayRequest.amountVnd`, what the user typed) — never a value echoed back by
 * `quote`/`prepare` — so this check has no server-controlled input to manipulate. A no-op when
 * `amountVndStr` is absent (the QR carried its own amount and the caller never collected one) —
 * every screen Wave B built always collects one, so this is a defensive fallback, not the expected
 * path.
 */
function assertFxSanityBound(amountVndStr: string | undefined, confirmedAmountMicro: bigint): void {
  if (amountVndStr === undefined) return;
  const amountVnd = BigInt(amountVndStr);
  if (amountVnd <= 0n) return;

  const microPerUsdc = 1_000_000n;
  const minMicro = (amountVnd * microPerUsdc) / BigInt(FX_VND_PER_USDC_MAX);
  const maxMicro = (amountVnd * microPerUsdc) / BigInt(FX_VND_PER_USDC_MIN);
  if (confirmedAmountMicro < minMicro || confirmedAmountMicro > maxMicro) {
    throw new VaultPaySecurityError(
      `quoted amount (${confirmedAmountMicro} micro-USDC) for ${amountVndStr} VND falls outside the ` +
        `${FX_VND_PER_USDC_MIN}-${FX_VND_PER_USDC_MAX} VND/USDC sanity band (expected ` +
        `${minMicro}-${maxMicro} micro-USDC)`,
    );
  }
}

export interface PayVaultParams {
  tripId: number;
  request: PayRequest;
  api?: ApiClient;
}

/**
 * Records the payment, verifies the transaction, signs it and submits.
 *
 * A payment over the trip's threshold comes back as `awaitingApproval` — the proposer's own
 * signature on the propose-spend transaction IS their approval on chain, so it is still signed and
 * submitted here rather than left for later.
 *
 * TODO(security): the amount this binds to is a `quoteVaultPayment` call made internally, right
 * here, from `request.amountVnd` — the user never sees the resulting USDC number before this
 * function signs. No confirm/receipt screen exists yet in this codebase to show it on. Once one is
 * built (Wave C or the pay orchestrator), have it call `quoteVaultPayment` itself, display
 * `amountUsdcMicro` for the user to confirm, and pass that same value down instead of leaving
 * `payVault` to fetch its own — `assertFxSanityBound` and the quote-vs-prepare equality check
 * narrow the risk in the meantime but do not fully replace an on-screen confirmation.
 */
export async function payVault(params: PayVaultParams): Promise<PayOutcome> {
  const { tripId, request, api = defaultApi } = params;
  const owner = await ensureVaultWallet();
  // Read once, before `prepare` — every check below reuses this reading rather than re-fetching
  // after `prepare` answers, so `prepare` can never retarget which vaultPda/ATA the checks run
  // against (S-4/S-4b).
  const balance = await fetchVaultBalance(tripId, api);
  const spendRecipientAta = requireSpendRecipientAta(balance);

  // Bind the amount to what the user themselves supplied (the decoded QR account + the VND they
  // typed on VaultPayAmountScreen) — not to anything `prepare` will say. `quote` here is a second,
  // independent server call driven only by those user-confirmed inputs; `prepare`'s answer is
  // cross-checked against it below before anything is signed.
  const quote = await quoteVaultPayment(
    tripId,
    { qrPayload: request.qrPayload, amountVnd: request.amountVnd, source: request.source },
    api,
  );
  const confirmedAmountMicro = BigInt(quote.amountUsdcMicro);
  // Last independent check before anything is created server-side: nothing the server sent feeds
  // into this bound, so a compromised server returning a consistent-but-inflated quote+prepare pair
  // still gets caught here.
  assertFxSanityBound(request.amountVnd, confirmedAmountMicro);

  const prepared = await prepareVaultPayment(tripId, request, api);

  // Once `sign` has returned, a signature exists and the submit may already be in flight (or have
  // landed) — abandoning then could retire a row whose payment is going through. Only failures
  // BEFORE that point (amount/source checks, verify, a sign that never produced a signature)
  // abandon the prepared row (final-review C7).
  let signed = false;
  try {
    if (BigInt(prepared.amountUsdcMicro) !== confirmedAmountMicro) {
      throw new VaultPaySecurityError(
        `prepare amount (${prepared.amountUsdcMicro}) does not match the quoted amount (${quote.amountUsdcMicro})`,
      );
    }
    const expectedSource = request.source ?? 'VAULT';
    if (prepared.source !== expectedSource) {
      throw new VaultPaySecurityError(
        `prepare source (${prepared.source}) does not match the requested source (${expectedSource})`,
      );
    }
    return await completeVaultPayment({
      tripId,
      prepared,
      confirmedAmountMicro,
      spendRecipientAta,
      owner,
      api,
      onSigned: () => {
        signed = true;
      },
    });
  } catch (error) {
    // The row exists from the moment prepare answered. If it never gets a signature, it would
    // sit PENDING and read as money spent — retire it now. Best effort: the original failure is
    // the one worth reporting.
    if (!signed) {
      await abandonVaultPayment(tripId, prepared.vaultTransactionId, api).catch(() => undefined);
    }
    throw error;
  }
}

interface CompleteVaultPaymentParams {
  tripId: number;
  prepared: PreparePaymentResponseDto;
  /** The USDC amount the user's own inputs quoted — already asserted equal to `prepared.amountUsdcMicro`. */
  confirmedAmountMicro: bigint;
  spendRecipientAta: string;
  owner: string;
  api: ApiClient;
  /** Forwarded to `signAndSubmit`: a signature exists from here on. */
  onSigned: () => void;
}

async function completeVaultPayment(params: CompleteVaultPaymentParams): Promise<PayOutcome> {
  const { tripId, prepared, confirmedAmountMicro, spendRecipientAta, owner, api, onSigned } =
    params;
  const { vaultPda, vaultUsdcAta } = deriveVaultAccounts(tripId);

  if (prepared.source === 'PERSONAL') {
    const result = await signAndSubmit({
      unsignedTx: prepared.base64Tx,
      onSigned,
      verify: () =>
        verifyTokenTransfer({
          base64: prepared.base64Tx,
          expectedAmountMicro: confirmedAmountMicro,
          // The caller's own USDC account, from the local key — not `prepared.payerAta`.
          expectedSource: deriveAssociatedTokenAddress(owner, VAULT_USDC_MINT),
          expectedDestination: spendRecipientAta,
          expectedOwner: owner,
        }),
      submit: (signedTx) => submitVaultPayment(tripId, prepared.vaultTransactionId, signedTx, api),
    });
    return outcomeFromStatus(result.status, prepared.vaultTransactionId);
  }

  if (prepared.needsApproval) {
    await signAndSubmit({
      unsignedTx: prepared.base64Tx,
      onSigned,
      verify: () =>
        verify({
          base64: prepared.base64Tx,
          expectedProgramId: VAULT_PROGRAM_ID,
          expectedDiscriminator: VAULT_DISCRIMINATORS.proposeSpend,
          expectedAmountMicro: confirmedAmountMicro,
          expectedAccounts: [vaultPda, spendRecipientAta, owner],
        }),
      submit: (signedTx) => submitVaultPayment(tripId, prepared.vaultTransactionId, signedTx, api),
    });
    return { kind: 'awaitingApproval', vaultTransactionId: prepared.vaultTransactionId };
  }

  const result = await signAndSubmit({
    unsignedTx: prepared.base64Tx,
    onSigned,
    verify: () =>
      verify({
        base64: prepared.base64Tx,
        expectedProgramId: VAULT_PROGRAM_ID,
        expectedDiscriminator: VAULT_DISCRIMINATORS.spend,
        expectedAmountMicro: confirmedAmountMicro,
        expectedAccounts: [vaultPda, spendRecipientAta, owner, vaultUsdcAta],
      }),
    submit: (signedTx) => submitVaultPayment(tripId, prepared.vaultTransactionId, signedTx, api),
  });
  return outcomeFromStatus(result.status, prepared.vaultTransactionId);
}

export interface ApproveVaultTransactionParams {
  tripId: number;
  vaultTransactionId: number;
  api?: ApiClient;
}

/**
 * Adds the caller's approval to a payment that needed a second signature.
 *
 * `expectedAmountMicro: null` is correct here, not a gap: `approve_spend` takes zero instruction
 * args (`server/src/solana/idl/oneplan_vault.json`) — there is no amount byte at this instruction
 * to bind to, because the program fixes the spend amount once, at `propose_spend` time (checked in
 * `payVault`/`completeVaultPayment` above), and no later instruction can alter it. `vaultTransactionId`
 * (chosen by the caller from the receipt they were shown) scopes exactly which on-chain proposal
 * this approves; the account list below still pins destination/vault/owner so approval can't be
 * redirected to a different vault or payout wallet.
 */
export async function approveVaultTransaction(
  params: ApproveVaultTransactionParams,
): Promise<PayOutcome> {
  const { tripId, vaultTransactionId, api = defaultApi } = params;
  const owner = await ensureVaultWallet();
  const balance = await fetchVaultBalance(tripId, api);
  const spendRecipientAta = requireSpendRecipientAta(balance);
  const { vaultPda, vaultUsdcAta } = deriveVaultAccounts(tripId);
  const { base64Tx } = await buildApproveVaultPayment(tripId, vaultTransactionId, api);

  const result = await signAndSubmit({
    unsignedTx: base64Tx,
    verify: () =>
      verify({
        base64: base64Tx,
        expectedProgramId: VAULT_PROGRAM_ID,
        expectedDiscriminator: VAULT_DISCRIMINATORS.approveSpend,
        expectedAmountMicro: null,
        expectedAccounts: [vaultPda, spendRecipientAta, owner, vaultUsdcAta],
      }),
    submit: (signedTx) => submitVaultPayment(tripId, vaultTransactionId, signedTx, api),
  });
  return outcomeFromStatus(result.status, vaultTransactionId);
}

export interface CancelVaultTransactionParams {
  tripId: number;
  vaultTransactionId: number;
  api?: ApiClient;
}

/**
 * Drops an open above-threshold proposal. Proposer or host/co-host — enforced server-side; the
 * server also refuses to build the cancel transaction for anyone else, so a permission check never
 * needs to be duplicated on device. Does not move USDC.
 */
export async function cancelVaultTransaction(params: CancelVaultTransactionParams): Promise<void> {
  const { tripId, vaultTransactionId, api = defaultApi } = params;
  const owner = await ensureVaultWallet();
  const { vaultPda } = deriveVaultAccounts(tripId);
  const { base64Tx } = await buildCancelVaultPayment(tripId, vaultTransactionId, api);

  await signAndSubmit({
    unsignedTx: base64Tx,
    verify: () =>
      verify({
        base64: base64Tx,
        expectedProgramId: VAULT_PROGRAM_ID,
        expectedDiscriminator: VAULT_DISCRIMINATORS.cancelSpend,
        expectedAmountMicro: null,
        expectedAccounts: [vaultPda, owner],
      }),
    submit: (signedTx) => submitVaultPaymentCancel(tripId, vaultTransactionId, signedTx, api),
  });
}

// ---------------------------------------------------------------------------
// TanStack hooks
// ---------------------------------------------------------------------------

/** Vault balance/history/settlement all move when a payment lands. */
export function invalidateVaultPay(queryClient: QueryClient, tripId: number): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.vault.balance(tripId) }),
    queryClient.invalidateQueries({ queryKey: keys.vault.history(tripId) }),
    queryClient.invalidateQueries({ queryKey: keys.vault.settlement(tripId) }),
  ]);
}

export function useLookupVaultRecipient(tripId: number, api: ApiClient = defaultApi) {
  return useMutation({
    mutationFn: (qrPayload: string) => lookupVaultRecipient(tripId, qrPayload, api),
  });
}

export function usePayVault(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: Omit<PayVaultParams, 'tripId' | 'api'>) =>
      payVault({ tripId, api, ...vars }),
    onSuccess: (outcome) => {
      if (outcome.kind !== 'awaitingApproval') return invalidateVaultPay(queryClient, tripId);
      return undefined;
    },
  });
}

export function useApproveVaultTransaction(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: Omit<ApproveVaultTransactionParams, 'tripId' | 'api'>) =>
      approveVaultTransaction({ tripId, api, ...vars }),
    onSuccess: () => invalidateVaultPay(queryClient, tripId),
  });
}

export function useCancelVaultTransaction(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: Omit<CancelVaultTransactionParams, 'tripId' | 'api'>) =>
      cancelVaultTransaction({ tripId, api, ...vars }),
    onSuccess: () => invalidateVaultPay(queryClient, tripId),
  });
}
