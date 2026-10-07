import { create } from 'zustand';

import type { PendingInvite } from '@/features/invite/types';

import type { ConnectionState } from './RealtimeClient';

export type RealtimeEffectKind =
  'tripEnded' | 'tripDeleted' | 'tripMemberRemoved' | 'vaultApprovalRequested';

/** A vault spend over the trip threshold that needs another member's signature. */
export interface VaultApprovalRequest {
  tripId: number;
  vaultTransactionId: number;
  amountVnd: string;
  recipientName: string;
  /** The member who raised it — the chain refuses a second signature from the same key. */
  proposedByUserId: number | null;
  /** Who may sign, or null when any member may. */
  approverUserIds: number[] | null;
}
/**
 * `tripMemberRemoved.userId` is optional: the server payload always has it (`envelope.ts`), but
 * it's threaded through as an extra so a caller who only cares "did *a* member get removed"
 * (query invalidation) doesn't have to supply one — `useTripRealtimeEffects`'s "was it me?"
 * check (Wave E) is the one consumer that reads it.
 */
export type RealtimeEffect =
  | { type: 'tripEnded'; tripId: number }
  | { type: 'tripDeleted'; tripId: number }
  | { type: 'tripMemberRemoved'; tripId: number; userId?: number }
  | ({ type: 'vaultApprovalRequested' } & VaultApprovalRequest);

const EFFECT_FIELD = {
  tripEnded: 'lastTripEnded',
  tripDeleted: 'lastTripDeleted',
  tripMemberRemoved: 'lastTripMemberRemoved',
  vaultApprovalRequested: 'lastVaultApprovalRequested',
} as const satisfies Record<RealtimeEffectKind, string>;

interface RealtimeStoreState {
  state: ConnectionState;
  /** Latest `tripEnded` / `tripDeleted` / `tripMemberRemoved` a screen has not reacted to yet. */
  lastTripEnded: { tripId: number } | null;
  lastTripDeleted: { tripId: number } | null;
  /** Latest `tripMemberRemoved` — carries `userId` when known, so a screen can tell if it was
   * removed too. */
  lastTripMemberRemoved: { tripId: number; userId?: number } | null;
  /** Latest `vaultApprovalRequested` the trip's vault card has not prompted for yet. */
  lastVaultApprovalRequested: VaultApprovalRequest | null;
  setState: (state: ConnectionState) => void;
  pushEffect: (effect: RealtimeEffect) => void;
  /** True when a pending effect for `tripId` existed; clears it. */
  consumeEffect: (kind: RealtimeEffectKind, tripId: number) => boolean;
  reset: () => void;
}

const INITIAL = {
  state: 'disconnected' as ConnectionState,
  lastTripEnded: null,
  lastTripDeleted: null,
  lastTripMemberRemoved: null,
  lastVaultApprovalRequested: null,
};

/** Not persisted: realtime effects are only meaningful for the live session. */
export const useRealtimeStore = create<RealtimeStoreState>()((set, get) => ({
  ...INITIAL,
  setState: (state) => set({ state }),
  pushEffect: (effect) => {
    const { type, ...payload } = effect;
    set({ [EFFECT_FIELD[type]]: payload });
  },
  consumeEffect: (kind, tripId) => {
    const field = EFFECT_FIELD[kind];
    const pending = get()[field];
    if (pending?.tripId !== tripId) return false;
    set({ [field]: null });
    return true;
  },
  reset: () => set(INITIAL),
}));

/**
 * Trips the current user is leaving on their own (classic `LeaveTripSheet`, which navigates
 * itself). The server also broadcasts `tripMemberRemoved` to the leaver; without this the trip
 * screen's "I was removed" handler would navigate a second time on top of the sheet's `replace`.
 * Entries expire so a leave whose event never arrives cannot swallow a later, genuine removal.
 */
const SELF_LEAVE_TTL_MS = 30_000;
const selfLeaves = new Map<number, number>();

export function markSelfLeave(tripId: number): void {
  selfLeaves.set(tripId, Date.now());
}

export function unmarkSelfLeave(tripId: number): void {
  selfLeaves.delete(tripId);
}

/** True when `tripId` was marked recently; clears the mark either way (one-shot). */
export function consumeSelfLeave(tripId: number): boolean {
  const markedAt = selfLeaves.get(tripId);
  selfLeaves.delete(tripId);
  return markedAt !== undefined && Date.now() - markedAt <= SELF_LEAVE_TTL_MS;
}

/** Non-hook access (the realtime client lives outside React). */
export const realtimeStore = {
  setState: (state: ConnectionState) => useRealtimeStore.getState().setState(state),
  pushEffect: (effect: RealtimeEffect) => useRealtimeStore.getState().pushEffect(effect),
  reset: () => {
    selfLeaves.clear();
    useRealtimeStore.getState().reset();
  },
};

/**
 * Invite listeners. `pendingInvitesStore` lands in M2.3 and will register here;
 * until then the event is simply broadcast to whoever is listening.
 */
type InviteListener = (invite: PendingInvite) => void;
const inviteListeners = new Set<InviteListener>();

/** Registers `fn` for `tripInviteReceived`; returns an unregister function. */
export function setInviteListener(fn: InviteListener): () => void {
  inviteListeners.add(fn);
  return () => {
    inviteListeners.delete(fn);
  };
}

export function emitInviteReceived(invite: PendingInvite): void {
  for (const listener of inviteListeners) listener(invite);
}

/** Test-only. */
export function _resetInviteListenersForTests(): void {
  inviteListeners.clear();
}
