/** @jest-environment node */
import { keys } from '@/api/keys';
import type { RealtimeEvent } from './envelope';
import { invalidationFor as invalidationForWith } from './invalidation';

/** Every case below runs with the web3 flag on unless it says otherwise. */
const invalidationFor = (e: RealtimeEvent) => invalidationForWith(e, { web3Enabled: true });

describe('invalidationFor', () => {
  it('tripEnded invalidates the trip, its settlement slices + list and carries the effect', () => {
    expect(invalidationFor({ event: 'tripEnded', data: { tripId: 12 } })).toEqual({
      queryKeys: [
        { queryKey: keys.trips.detail(12), exact: true },
        keys.trips.settlements(12),
        keys.trips.breakdown(12),
        ['trips', 'list'],
      ],
      effect: { type: 'tripEnded', tripId: 12 },
    });
  });

  it('tripDeleted marks the trip stale without refetching, refreshes the list', () => {
    expect(invalidationFor({ event: 'tripDeleted', data: { tripId: 12 } })).toEqual({
      queryKeys: [{ queryKey: keys.trips.detail(12), refetchType: 'none' }, ['trips', 'list']],
      effect: { type: 'tripDeleted', tripId: 12 },
    });
  });

  it('tripSettlementUpdated invalidates only the money slices, not the whole trip', () => {
    expect(invalidationFor({ event: 'tripSettlementUpdated', data: { tripId: 12 } })).toEqual({
      queryKeys: [
        { queryKey: keys.trips.detail(12), exact: true },
        keys.trips.budgets(12),
        keys.trips.expenses(12),
        keys.trips.breakdown(12),
        keys.trips.settlements(12),
        keys.trips.leavePreview(12),
      ],
    });
  });

  it('tripInviteReceived invalidates pendingInvites and carries the effect', () => {
    const invite = {
      inviteCode: 'ABC',
      tripName: 'Trip',
      coverImageUrl: null,
      invitedByDisplayName: 'Ken',
    };
    expect(invalidationFor({ event: 'tripInviteReceived', data: invite })).toEqual({
      queryKeys: [keys.trips.pendingInvites],
      effect: { type: 'inviteReceived', invite },
    });
  });

  it('friendRequestReceived invalidates friends.requests', () => {
    expect(invalidationFor({ event: 'friendRequestReceived', data: {} })).toEqual({
      queryKeys: [keys.friends.requests],
    });
  });

  it('friendRequestReceived with an id marks the request as live', () => {
    expect(invalidationFor({ event: 'friendRequestReceived', data: { id: 42 } })).toEqual({
      queryKeys: [keys.friends.requests],
      effect: { type: 'friendRequestReceived', requestId: 42 },
    });
  });

  it('friendRequestAccepted invalidates friends.requests and friends.all', () => {
    expect(
      invalidationFor({ event: 'friendRequestAccepted', data: { acceptedBy: 'Ken' } }),
    ).toEqual({ queryKeys: [keys.friends.requests, keys.friends.all] });
  });

  it('tripMemberRoleUpdated invalidates only the trip detail', () => {
    expect(
      invalidationFor({
        event: 'tripMemberRoleUpdated',
        data: { tripId: 12, userId: 3, role: 'CO_HOST' },
      }),
    ).toEqual({ queryKeys: [{ queryKey: keys.trips.detail(12), exact: true }] });
  });

  it('vaultApprovalRequested invalidates vault balance + history, no effect (Wave B owns the alert)', () => {
    expect(
      invalidationFor({
        event: 'vaultApprovalRequested',
        data: {
          tripId: 12,
          vaultTransactionId: 99,
          amountVnd: '500000',
          recipientName: 'A',
          proposedByUserId: 3,
          approverUserIds: null,
        },
      }),
    ).toEqual({ queryKeys: [keys.vault.balance(12), keys.vault.history(12)] });
  });

  it('vaultBalanceChanged invalidates vault balance/history/myWallet/settlement', () => {
    expect(
      invalidationFor({ event: 'vaultBalanceChanged', data: { tripId: 12 } }),
    ).toEqual({
      queryKeys: [
        keys.vault.balance(12),
        keys.vault.history(12),
        keys.vault.myWallet(12),
        keys.vault.settlement(12),
      ],
    });
  });

  it('vaultSettlementUpdated invalidates settlement/history/balance', () => {
    expect(
      invalidationFor({ event: 'vaultSettlementUpdated', data: { tripId: 12, isSettled: true } }),
    ).toEqual({
      queryKeys: [keys.vault.settlement(12), keys.vault.history(12), keys.vault.balance(12)],
    });
  });

  it('tripEndRequestUpdated invalidates the trip detail', () => {
    expect(
      invalidationFor({
        event: 'tripEndRequestUpdated',
        data: { tripId: 12, status: 'PENDING', approvedCount: 1, memberCount: 3 },
      }),
    ).toEqual({ queryKeys: [{ queryKey: keys.trips.detail(12), exact: true }] });
  });

  it('vaultLeaveRequested invalidates the trip detail, the host-side requests list, and the leave preview', () => {
    expect(
      invalidationFor({ event: 'vaultLeaveRequested', data: { tripId: 12, userId: 3 } }),
    ).toEqual({
      queryKeys: [
        { queryKey: keys.trips.detail(12), exact: true },
        keys.vault.leaveRequests(12),
        keys.trips.leavePreview(12),
      ],
    });
  });

  it('tripMemberRemoved invalidates the trip detail + vault leave state + list and carries the effect with userId', () => {
    expect(
      invalidationFor({
        event: 'tripMemberRemoved',
        data: { tripId: 12, userId: 3, displayName: 'Ken' },
      }),
    ).toEqual({
      queryKeys: [
        { queryKey: keys.trips.detail(12), exact: true },
        keys.vault.leaveRequests(12),
        keys.trips.leavePreview(12),
        ['trips', 'list'],
      ],
      effect: { type: 'tripMemberRemoved', tripId: 12, userId: 3 },
    });
  });

  it('tripMemberRemoved acts on nothing with the web3 flag off — same as develop (H3)', () => {
    expect(
      invalidationForWith(
        { event: 'tripMemberRemoved', data: { tripId: 12, userId: 3, displayName: 'Ken' } },
        { web3Enabled: false },
      ),
    ).toEqual({ queryKeys: [] });
  });

  it('unknown newMessage event invalidates nothing', () => {
    expect(invalidationFor({ event: 'unknown', name: 'newMessage', data: {} })).toEqual({
      queryKeys: [],
    });
  });

  it('unknown event invalidates nothing', () => {
    expect(invalidationFor({ event: 'unknown', name: 'somethingElse', data: {} })).toEqual({
      queryKeys: [],
    });
  });

  it('error event invalidates nothing', () => {
    expect(invalidationFor({ event: 'error', data: { message: 'boom' } })).toEqual({
      queryKeys: [],
    });
  });
});
