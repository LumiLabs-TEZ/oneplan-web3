/**
 * Cross-screen handoff for a locked-amount vault deposit — RN counterpart of iOS's
 * `.vaultRequestContribute` NotificationCenter post (`VaultLeaveBottomSheet` → `TripVaultSection`'s
 * Contribute sheet, `TripDetailView.swift:605-611`). Same non-hook listener shape as
 * `setInviteListener`/`emitInviteReceived` (`@/realtime/realtimeStore.ts`).
 *
 * `VaultLeaveSheet` calls `requestVaultContribute` once it finishes dismissing; whichever screen
 * owns the Contribute sheet (`trip-vault-section`, not yet built as of Wave E) registers a
 * listener to open it pre-filled with the locked, fee-grossed amount. No listener registered yet
 * ⇒ this silently no-ops, same as iOS posting to nobody.
 */
type ContributeRequestListener = (tripId: number, grossDepositMicro: number) => void;

const listeners = new Set<ContributeRequestListener>();

export function setVaultContributeRequestListener(fn: ContributeRequestListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function requestVaultContribute(tripId: number, grossDepositMicro: number): void {
  for (const listener of listeners) listener(tripId, grossDepositMicro);
}

/** Test-only. */
export function _resetVaultContributeListenersForTests(): void {
  listeners.clear();
}
