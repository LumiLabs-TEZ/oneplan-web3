import { keys } from '@/api/keys';
import type { PendingInvite } from '@/features/invite/types';
import type { RealtimeEvent } from './envelope';

/**
 * A key to invalidate. A bare key matches every query under it (TanStack prefix match);
 * `exact` limits it to that one query, `refetchType: 'none'` only marks matches stale.
 */
export type InvalidationTarget =
  | readonly unknown[]
  | { queryKey: readonly unknown[]; exact?: boolean; refetchType?: 'none' };

export type Invalidation = {
  queryKeys: readonly InvalidationTarget[];
  effect?:
    | { type: 'tripEnded' | 'tripDeleted'; tripId: number }
    | { type: 'tripMemberRemoved'; tripId: number; userId?: number }
    | { type: 'inviteReceived'; invite: PendingInvite }
    | { type: 'friendRequestReceived'; requestId: number };
};

export interface InvalidationOptions {
  /** Web3 flag. Events that only exist for the web3 feature act on nothing when it is off. */
  web3Enabled: boolean;
}

export function invalidationFor(e: RealtimeEvent, opts: InvalidationOptions): Invalidation {
  switch (e.event) {
    // `keys.trips.detail(id)` prefixes every sub-resource of the trip, so each event names only
    // the slices it can change instead of refetching the whole trip on every member's device.
    case 'tripEnded':
      return {
        queryKeys: [
          { queryKey: keys.trips.detail(e.data.tripId), exact: true },
          keys.trips.settlements(e.data.tripId),
          keys.trips.breakdown(e.data.tripId),
          ['trips', 'list'],
        ],
        effect: { type: e.event, tripId: e.data.tripId },
      };
    case 'tripDeleted':
      // The trip is gone: refetching its slices would only 404. Mark them stale instead.
      return {
        queryKeys: [
          { queryKey: keys.trips.detail(e.data.tripId), refetchType: 'none' },
          ['trips', 'list'],
        ],
        effect: { type: e.event, tripId: e.data.tripId },
      };
    // Sent after settling up AND after a trip currency change, which rewrites expense, share
    // and budget amounts (server `migrateTripCurrency`) — plan items are untouched by both.
    case 'tripSettlementUpdated':
      return {
        queryKeys: [
          { queryKey: keys.trips.detail(e.data.tripId), exact: true },
          keys.trips.budgets(e.data.tripId),
          keys.trips.expenses(e.data.tripId),
          keys.trips.breakdown(e.data.tripId),
          keys.trips.settlements(e.data.tripId),
          keys.trips.leavePreview(e.data.tripId),
        ],
      };
    case 'tripInviteReceived':
      return {
        queryKeys: [keys.trips.pendingInvites],
        effect: { type: 'inviteReceived', invite: e.data },
      };
    case 'friendRequestReceived': {
      // Payload is the server's `FriendRequestDto`; its id marks the request as live (popup).
      const id = (e.data as { id?: unknown } | null)?.id;
      return typeof id === 'number'
        ? {
            queryKeys: [keys.friends.requests],
            effect: { type: 'friendRequestReceived', requestId: id },
          }
        : { queryKeys: [keys.friends.requests] };
    }
    case 'friendRequestAccepted':
      return { queryKeys: [keys.friends.requests, keys.friends.all] };
    // Role changes gate who can approve a spend / act as co-host — refresh the trip so those
    // checks read the current role, not the one from when the screen mounted.
    case 'tripMemberRoleUpdated':
      return { queryKeys: [{ queryKey: keys.trips.detail(e.data.tripId), exact: true }] };
    // Query invalidation only here — the propose-spend alert itself is Wave B's concern
    // (`vault-pay-and-approve-orchestration`, `docs/web3/rn-ui-parity-inventory.md`), which reads
    // this already-typed event straight off `RealtimeEvent` to add its own effect.
    case 'vaultApprovalRequested':
      return {
        queryKeys: [keys.vault.balance(e.data.tripId), keys.vault.history(e.data.tripId)],
      };
    // iOS comment (`sendVaultBalanceChanged`): this must be posted by whoever moved the money,
    // never by a mere read, or clients would loop refetch-and-repost until the RPC provider
    // throttles the trip — the invalidation side only ever reacts, never re-announces.
    case 'vaultBalanceChanged':
      return {
        queryKeys: [
          keys.vault.balance(e.data.tripId),
          keys.vault.history(e.data.tripId),
          keys.vault.myWallet(e.data.tripId),
          keys.vault.settlement(e.data.tripId),
        ],
      };
    case 'vaultSettlementUpdated':
      return {
        queryKeys: [
          keys.vault.settlement(e.data.tripId),
          keys.vault.history(e.data.tripId),
          keys.vault.balance(e.data.tripId),
        ],
      };
    // No dedicated end-request query key yet (Wave D owns that read); refreshing the trip detail
    // is enough for the vault card's `isWaitingForEndApproval` state to stay current.
    case 'tripEndRequestUpdated':
      return { queryKeys: [{ queryKey: keys.trips.detail(e.data.tripId), exact: true }] };
    // Broadcast to the announcer too, so their own leave-preview flips to `leaveRequestPending`;
    // `keys.vault.leaveRequests` is the host-side pending-requests list (Wave E).
    case 'vaultLeaveRequested':
      return {
        queryKeys: [
          { queryKey: keys.trips.detail(e.data.tripId), exact: true },
          keys.vault.leaveRequests(e.data.tripId),
          keys.trips.leavePreview(e.data.tripId),
        ],
      };
    case 'tripMemberRemoved':
      // Flag off = develop, which ignores this event entirely (final-review H3): no refetch of
      // every member's trip detail/list, and no "removed me → leave the screen" effect.
      if (!opts.web3Enabled) return { queryKeys: [] };
      return {
        queryKeys: [
          { queryKey: keys.trips.detail(e.data.tripId), exact: true },
          keys.vault.leaveRequests(e.data.tripId),
          keys.trips.leavePreview(e.data.tripId),
          ['trips', 'list'],
        ],
        effect: { type: 'tripMemberRemoved', tripId: e.data.tripId, userId: e.data.userId },
      };
    case 'error':
    case 'unknown':
    default:
      return { queryKeys: [] };
  }
}
