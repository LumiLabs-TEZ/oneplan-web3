/**
 * First-open invite sheet decision (`TripDetailView.swift:1540-1558`).
 * Pure so the hook around it stays a thin MMKV + sheet-ref wrapper.
 */
export interface FirstOpenInviteInput {
  /** Offline opens never present — the QR/share link is useless without a fetch. */
  online: boolean;
  inviteCode: string | null | undefined;
  /** `tripInviteSheetShown.{tripId}` was already written on an earlier open. */
  alreadyShown: boolean;
}

export function shouldShowFirstOpenInvite({
  online,
  inviteCode,
  alreadyShown,
}: FirstOpenInviteInput): boolean {
  if (!online || alreadyShown) return false;
  return Boolean(inviteCode && inviteCode.length > 0);
}

/** MMKV key for the one-shot flag (iOS `UserDefaults` key of the same shape). */
export function firstOpenInviteKey(tripId: number): string {
  return `tripInviteSheetShown.${tripId}`;
}
