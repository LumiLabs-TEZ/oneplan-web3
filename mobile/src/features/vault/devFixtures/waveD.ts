/**
 * Offline fixtures for the `(dev)/vault-wave-d` gallery (end-trip consensus + settlement).
 *
 * One ledger drives every number: the history rows, `balanceMicro`, the cash debts' totals and
 * the settlement hero total are all derived from `DEPOSIT_MICRO` / `SPENDS` / `DEBT_LINES`, and
 * every USDC↔VND figure uses `FALLBACK_USDC_TO_VND` — the same constant the screens fall back to
 * — so the screenshots can't disagree with themselves. The exchange-rate query is seeded with
 * that constant too, otherwise the screens would fetch a live rate and drift from the fixtures.
 *
 * `makeFixtureClient` never touches the network: every query the four screens read is seeded and
 * marked never-stale (a default `staleTime: 0` made `useQuery` refetch on mount, which is how the
 * Review state used to hit `GET /trips/…/end-request/review` and pop a native error alert).
 */
import { QueryClient } from '@tanstack/react-query';

import { keys } from '@/api/keys';
import type { CashDebtDto, TripEndRequestDto, TripEndReviewDto } from '@/features/vault/api/endTrip';
import type { SettlementPreviewDto, VaultHistoryEntryDto } from '@/features/vault/api/queries';
import { FALLBACK_USDC_TO_VND } from '@/features/vault/helpers/tripEndSettlement';

export const TRIP_ID = 999_001;
export const MY_USER_ID = 1;

const MEMBERS: TripEndRequestDto['members'] = [
  { userId: 1, displayName: 'Ken', avatarUrl: null, decision: 'APPROVED' },
  { userId: 2, displayName: 'Shin', avatarUrl: null, decision: 'DENIED' },
  { userId: 3, displayName: 'Hyydesi', avatarUrl: null, decision: null },
];

export const PENDING_REQUEST: TripEndRequestDto = {
  id: 1,
  tripId: TRIP_ID,
  requestedBy: 1,
  status: 'PENDING',
  createdAt: new Date().toISOString(),
  resolvedAt: null,
  myDecision: 'APPROVED',
  approvedCount: 1,
  memberCount: 3,
  members: MEMBERS,
};

export const DENIED_REQUEST: TripEndRequestDto = {
  ...PENDING_REQUEST,
  status: 'DENIED',
  resolvedAt: new Date().toISOString(),
};

// --- the ledger -----------------------------------------------------------

export const DEPOSIT_MICRO = 5_000_000;

/** Vault spends: USDC actually debited; the VND face value is derived at the shared FX constant. */
export const SPENDS = [
  { id: 2, title: 'Lẩu bò Nhà Gỗ', category: 'FOOD', amountMicro: 1_000_000 },
  { id: 3, title: 'Homestay lần 2', category: 'STAY', amountMicro: 500_000 },
] as const;

export function microToVnd(amountMicro: number): number {
  return Math.round((amountMicro / 1_000_000) * FALLBACK_USDC_TO_VND);
}

const CREATED_AT = new Date().toISOString();
const KEN = { userId: 1, displayName: 'Ken', avatarUrl: null };

const HISTORY: VaultHistoryEntryDto[] = [
  {
    id: 1,
    kind: 'DEPOSIT',
    status: 'CONFIRMED',
    needsApproval: false,
    recipient: null,
    amountMicro: String(DEPOSIT_MICRO),
    amountVnd: null,
    title: null,
    category: null,
    paidBy: null,
    shareWith: [],
    fromAddress: '5FHwk...9qRT',
    signature: null,
    createdAt: CREATED_AT,
  },
  ...SPENDS.map(
    (spend): VaultHistoryEntryDto => ({
      id: spend.id,
      kind: 'SPEND',
      status: 'CONFIRMED',
      needsApproval: false,
      recipient: null,
      amountMicro: String(spend.amountMicro),
      amountVnd: String(microToVnd(spend.amountMicro)),
      title: spend.title,
      category: spend.category,
      paidBy: KEN,
      shareWith: [],
      fromAddress: null,
      signature: null,
      createdAt: CREATED_AT,
    }),
  ),
];

/** Shin owes Ken for both spends; the debt's `amountMicro` is the sum of its own lines. */
const DEBT_LINES: CashDebtDto['lines'] = SPENDS.map((spend) => ({
  title: spend.title,
  amountMicro: String(spend.amountMicro),
}));

const DEBT_MICRO = DEBT_LINES.reduce((sum, line) => sum + Number(line.amountMicro), 0);

export const CASH_DEBTS: CashDebtDto[] = [
  {
    fromUserId: 2,
    fromDisplayName: 'Shin',
    toUserId: 1,
    toDisplayName: 'Ken',
    amountMicro: String(DEBT_MICRO),
    isConfirmed: false,
    canConfirm: true,
    lines: DEBT_LINES,
    toWalletAddress: null,
  },
];

const SPENT_MICRO = SPENDS.reduce((sum, spend) => sum + spend.amountMicro, 0);

export const REVIEW: TripEndReviewDto = {
  request: { ...PENDING_REQUEST, myDecision: null },
  history: HISTORY,
  mySettlement: CASH_DEBTS,
  balanceMicro: String(DEPOSIT_MICRO - SPENT_MICRO),
};

export const SETTLEMENT: SettlementPreviewDto = {
  balanceMicro: '0',
  totalOnChainMicro: '0',
  totalOffChainMicro: String(DEBT_MICRO),
  payouts: [],
  canSettle: true,
  blockedReason: null,
  isSettled: true,
  cashDebts: CASH_DEBTS,
};

/** Settlement hero's "total spent" (VND) — the vault spends at the shared FX constant. */
export const TOTAL_SPENT_VND = microToVnd(SPENT_MICRO);

export function makeFixtureClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
  client.setQueryData(keys.vault.endReview(TRIP_ID), REVIEW);
  client.setQueryData(keys.vault.endRequest(TRIP_ID), PENDING_REQUEST);
  client.setQueryData(keys.vault.settlement(TRIP_ID), SETTLEMENT);
  client.setQueryData(keys.exchangeRate('USD', 'VND'), {
    from: 'USD',
    to: 'VND',
    rate: FALLBACK_USDC_TO_VND,
    fetchedAt: CREATED_AT,
    isStale: false,
  });
  return client;
}
