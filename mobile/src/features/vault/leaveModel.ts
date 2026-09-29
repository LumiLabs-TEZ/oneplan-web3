/**
 * Pure leave-eligibility math — port of `VaultLeaveBottomSheet.swift` (member sheet) and
 * `VaultLeaveHostBottomSheet.swift` (host sheet) computed properties, both `feat/web3-version`.
 * No i18n, no React: screens turn these into copy/props.
 */
import type { components } from '@/api/schema';

import { grossDeposit as grossDepositMicro } from './depositMath';
import { shortenAddress as shortenAddressValue } from './shortenAddress';

type LeavePreviewDto = components['schemas']['LeavePreviewDto'];
type VaultLeaveRequestDto = components['schemas']['VaultLeaveRequestDto'];

/** Below $0.01 displays as $0.00 — treated as balanced/settled everywhere in this file. */
export const DUST_MICRO = 10_000;

/**
 * Gross send so vault net after the 0.1% skim is at least `netMicro`. Number-typed wrapper over
 * `depositMath.grossDeposit` (the single implementation of the skim math): micro amounts here are
 * whole numbers parsed from the API's decimal strings, far below 2^53.
 */
export function grossDeposit(netMicro: number): number {
  if (!(netMicro > 0)) return 0;
  return Number(grossDepositMicro(BigInt(Math.ceil(netMicro))));
}

export function microToUsdc(micro: number): number {
  return micro / 1_000_000;
}

/** `formatSignedUsdc` — caller still runs the magnitude through `formatUsdc`. */
export function signedUsdcPrefix(signedMicro: number): '' | '+' | '-' {
  if (signedMicro < 0) return '-';
  if (signedMicro > 0) return '+';
  return '';
}

function toMicro(value: string | null | undefined): number {
  const n = Number(value ?? '0');
  return Number.isFinite(n) ? n : 0;
}

export type MemberLeaveKind = 'owe' | 'receive' | 'allGood';

export interface MemberLeaveState {
  kind: MemberLeaveKind;
  /** Live signed net micro-USDC (deposit − spend share). */
  netMicro: number;
  /** micro-USDC the member must deposit before announce (max(0,-net)). */
  owedMicro: number;
  /** The hero number — owed when `owe`, net when `receive`, 0 when `allGood`. */
  heroAmountMicro: number;
  /** Amount to send so the vault nets `owedMicro` after the 0.1% skim. 0 unless `owe`. */
  depositGrossMicro: number;
  /** Local gate for the Announce CTA — don't rely only on server `canAnnounce` (stale/dust). */
  canTapAnnounce: boolean;
  totalDepositedMicro: number;
  totalExpensesMicro: number;
}

/**
 * Derives the member leave sheet's state from `LeavePreviewDto` — port of
 * `VaultLeaveBottomSheet`'s `isOweDisplay`/`isReceiveDisplay`/`heroAmountMicro`/
 * `depositGrossMicro`/`canTapAnnounce`/`totalDepositedMicro`/`totalExpensesMicro`.
 */
export function memberLeaveState(
  preview: Pick<LeavePreviewDto, 'netMicro' | 'owedMicro' | 'lines' | 'leaveRequestPending'>,
): MemberLeaveState {
  const netMicro = toMicro(preview.netMicro);
  const owedMicro = toMicro(preview.owedMicro);
  const isOwe = netMicro <= -DUST_MICRO;
  const isReceive = netMicro >= DUST_MICRO;
  const kind: MemberLeaveKind = isOwe ? 'owe' : isReceive ? 'receive' : 'allGood';

  const heroAmountMicro = isOwe ? owedMicro : isReceive ? netMicro : 0;
  const depositGrossMicro = grossDeposit(owedMicro);
  const canTapAnnounce = !preview.leaveRequestPending && !isOwe;

  let totalDepositedMicro = 0;
  let totalExpensesMicro = 0;
  for (const line of preview.lines) {
    const signed = toMicro(line.amountMicro);
    if (signed > 0) totalDepositedMicro += signed;
    else if (signed < 0) totalExpensesMicro += signed;
  }

  return {
    kind,
    netMicro,
    owedMicro,
    heroAmountMicro,
    depositGrossMicro,
    canTapAnnounce,
    totalDepositedMicro,
    totalExpensesMicro,
  };
}

export type HostLeavePhase = 'request' | 'left';
export type HostLeaveStatusBadge = 'waiting' | 'received' | null;

export interface HostLeaveDisplay {
  /** ≥ $0.01 owed TO the leaving member — shows their wallet address, 'Approve & send'. */
  isPayout: boolean;
  displayAmountMicro: number;
  statusBadge: HostLeaveStatusBadge;
}

function flooredAbs(signed: number): number {
  const absVal = Math.abs(signed);
  return absVal >= DUST_MICRO ? absVal : 0;
}

function statusBadgeFor(status: string, isPayout: boolean): HostLeaveStatusBadge {
  switch (status) {
    case 'WAITING_DEPOSIT':
      return 'waiting';
    case 'READY':
      return 'received';
    default:
      // Stale PAYOUT + dust (or any unrecognised status) → treat like READY.
      return isPayout ? null : 'received';
  }
}

/**
 * Port of `VaultLeaveHostBottomSheet`'s `displayAmountMicro`/`isPayout`/`statusBadge`. `phase`
 * is the sheet's own local state (`request` while un-confirmed, `left` after `onConfirm`
 * succeeds) — not part of the DTO.
 */
export function hostLeaveDisplay(
  request: Pick<VaultLeaveRequestDto, 'netMicro' | 'announcedNetMicro' | 'status'>,
  phase: HostLeavePhase,
): HostLeaveDisplay {
  if (phase === 'left') {
    return { isPayout: false, displayAmountMicro: 0, statusBadge: null };
  }

  const netMicro = toMicro(request.netMicro);
  const announcedNetMicroRaw = Number(request.announcedNetMicro);
  const announcedNetMicro = Number.isFinite(announcedNetMicroRaw) ? announcedNetMicroRaw : netMicro;

  let displayAmountMicro: number;
  switch (request.status) {
    case 'WAITING_DEPOSIT': {
      const owed = netMicro < 0 ? netMicro : announcedNetMicro;
      displayAmountMicro = flooredAbs(owed);
      break;
    }
    case 'PAYOUT': {
      const due = Math.max(netMicro, announcedNetMicro);
      displayAmountMicro = flooredAbs(Math.max(due, 0));
      break;
    }
    case 'READY':
      // Figma 4716:2108 — amount deposited to settle, not live net (~0).
      displayAmountMicro = Math.max(announcedNetMicro, 0);
      break;
    default:
      displayAmountMicro =
        Math.abs(netMicro) >= DUST_MICRO ? flooredAbs(netMicro) : Math.max(announcedNetMicro, 0);
  }

  const isPayout = request.status === 'PAYOUT' && displayAmountMicro >= DUST_MICRO;
  return { isPayout, displayAmountMicro, statusBadge: statusBadgeFor(request.status, isPayout) };
}

/** Sheet height (`VaultLeaveBottomSheet.sheetHeight`) — row-count-driven, clamped. */
export function memberLeaveSheetHeight(lineCount: number): number {
  const rowEstimate = Math.max(lineCount, 1) * 80;
  return Math.min(720, Math.max(520, 300 + rowEstimate));
}

/** Sheet height (`VaultLeaveHostBottomSheet.sheetHeight`) — fixed per payout/non-payout. */
export function hostLeaveSheetHeight(isPayout: boolean): number {
  return isPayout ? 560 : 420;
}

/** `shortenedAddress` — `"abcd...wxyz"`, or the raw string when too short to shorten. */
export function shortenAddress(address: string | null | undefined): string | null {
  const raw = address ?? '';
  return raw.length === 0 ? null : shortenAddressValue(raw);
}

/** Oldest un-dismissed pending request — the one `TripDetailView` auto-presents to the host. */
export function oldestPendingRequest(
  requests: readonly VaultLeaveRequestDto[],
  dismissedUserIds: ReadonlySet<number>,
): VaultLeaveRequestDto | null {
  const pending = requests.filter((r) => !dismissedUserIds.has(r.userId));
  if (pending.length === 0) return null;
  return pending.reduce((oldest, r) =>
    new Date(r.requestedAt).getTime() < new Date(oldest.requestedAt).getTime() ? r : oldest,
  );
}
