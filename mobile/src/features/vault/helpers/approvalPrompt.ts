/**
 * Whether a `vaultApprovalRequested` broadcast is a question for this device — port of the guard
 * in `TripVaultSection.swift`'s `.vaultApprovalRequested` handler. The event reaches the whole
 * trip; two members it is not for: whoever raised it (the chain refuses a second signature from
 * the same key), and anyone outside a named approver list.
 */
import type { VaultApprovalRequest } from '@/realtime/realtimeStore';

export function shouldPromptApproval(
  request: VaultApprovalRequest,
  tripId: number,
  myUserId: number | undefined,
): boolean {
  if (request.tripId !== tripId || myUserId === undefined) return false;
  if (request.proposedByUserId === myUserId) return false;
  if (request.approverUserIds !== null && !request.approverUserIds.includes(myUserId)) return false;
  return true;
}
