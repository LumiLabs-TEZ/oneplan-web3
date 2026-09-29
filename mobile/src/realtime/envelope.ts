export type RealtimeEvent =
  | {
      event: 'tripInviteReceived';
      data: {
        inviteCode: string;
        tripName: string;
        coverImageUrl: string | null;
        invitedByDisplayName: string;
      };
    }
  | { event: 'tripEnded' | 'tripDeleted' | 'tripSettlementUpdated'; data: { tripId: number } }
  | { event: 'friendRequestReceived'; data: unknown }
  | { event: 'friendRequestAccepted'; data: { acceptedBy: string } }
  | {
      event: 'tripMemberRoleUpdated';
      data: { tripId: number; userId: number; role: string };
    }
  | {
      event: 'vaultApprovalRequested';
      data: {
        tripId: number;
        vaultTransactionId: number;
        amountVnd: string;
        recipientName: string;
        /** The member who raised it — the chain refuses a second signature from the same key. */
        proposedByUserId: number | null;
        /** Who may sign, or null when the trip lets any member. */
        approverUserIds: number[] | null;
      };
    }
  | {
      event: 'vaultBalanceChanged';
      data: {
        tripId: number;
        /** Absent when the event is a plain "refresh yourself" (e.g. the reconcile job). */
        kind?: string;
        actorUserId?: number | null;
        actorName?: string;
        amountMicro?: string;
      };
    }
  | { event: 'vaultSettlementUpdated'; data: { tripId: number; isSettled?: boolean } }
  | {
      event: 'tripEndRequestUpdated';
      data: {
        tripId: number;
        status: string;
        approvedCount: number;
        memberCount: number;
        deniedByUserId?: number;
      };
    }
  | { event: 'vaultLeaveRequested'; data: { tripId: number; userId: number } }
  | { event: 'tripMemberRemoved'; data: { tripId: number; userId: number; displayName: string } }
  | { event: 'error'; data: { message: string } }
  | { event: 'unknown'; name: string; data: unknown };

function coerceTripId(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = (data as Record<string, unknown>).tripId;
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    n = Number(raw);
  } else {
    return null;
  }
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function parseEnvelope(raw: string): RealtimeEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const event = obj.event;
  if (typeof event !== 'string') return null;
  const data = obj.data;

  switch (event) {
    case 'tripEnded':
    case 'tripDeleted':
    case 'tripSettlementUpdated': {
      const tripId = coerceTripId(data);
      if (tripId === null) return null;
      return { event, data: { tripId } };
    }
    case 'tripInviteReceived': {
      if (typeof data !== 'object' || data === null) return null;
      const d = data as Record<string, unknown>;
      const inviteCode = typeof d.inviteCode === 'string' ? d.inviteCode : '';
      if (inviteCode === '') return null;
      const coverImageUrl = typeof d.coverImageUrl === 'string' ? d.coverImageUrl : null;
      return {
        event: 'tripInviteReceived',
        data: {
          inviteCode,
          tripName: asString(d.tripName),
          coverImageUrl,
          invitedByDisplayName: asString(d.invitedByDisplayName),
        },
      };
    }
    case 'friendRequestReceived':
      return { event: 'friendRequestReceived', data };
    case 'friendRequestAccepted': {
      if (typeof data !== 'object' || data === null) return null;
      const d = data as Record<string, unknown>;
      return { event: 'friendRequestAccepted', data: { acceptedBy: asString(d.acceptedBy) } };
    }
    case 'tripMemberRoleUpdated': {
      if (typeof data !== 'object' || data === null) return null;
      const d = data as Record<string, unknown>;
      const tripId = coerceTripId(d);
      const userId = typeof d.userId === 'number' ? d.userId : null;
      if (tripId === null || userId === null) return null;
      return { event, data: { tripId, userId, role: asString(d.role) } };
    }
    case 'vaultApprovalRequested': {
      if (typeof data !== 'object' || data === null) return null;
      const d = data as Record<string, unknown>;
      const tripId = coerceTripId(d);
      const vaultTransactionId =
        typeof d.vaultTransactionId === 'number' ? d.vaultTransactionId : null;
      if (tripId === null || vaultTransactionId === null) return null;
      const proposedByUserId = typeof d.proposedByUserId === 'number' ? d.proposedByUserId : null;
      const approverUserIds = Array.isArray(d.approverUserIds)
        ? d.approverUserIds.filter((x): x is number => typeof x === 'number')
        : null;
      return {
        event,
        data: {
          tripId,
          vaultTransactionId,
          amountVnd: asString(d.amountVnd),
          recipientName: asString(d.recipientName),
          proposedByUserId,
          approverUserIds,
        },
      };
    }
    case 'vaultBalanceChanged': {
      const tripId = coerceTripId(data);
      if (tripId === null) return null;
      const d = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
      return {
        event,
        data: {
          tripId,
          kind: typeof d.kind === 'string' ? d.kind : undefined,
          actorUserId: typeof d.actorUserId === 'number' ? d.actorUserId : null,
          actorName: typeof d.actorName === 'string' ? d.actorName : undefined,
          amountMicro: typeof d.amountMicro === 'string' ? d.amountMicro : undefined,
        },
      };
    }
    case 'vaultSettlementUpdated': {
      const tripId = coerceTripId(data);
      if (tripId === null) return null;
      const d = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
      return {
        event,
        data: { tripId, isSettled: typeof d.isSettled === 'boolean' ? d.isSettled : undefined },
      };
    }
    case 'tripEndRequestUpdated': {
      if (typeof data !== 'object' || data === null) return null;
      const d = data as Record<string, unknown>;
      const tripId = coerceTripId(d);
      if (tripId === null) return null;
      return {
        event,
        data: {
          tripId,
          status: asString(d.status),
          approvedCount: typeof d.approvedCount === 'number' ? d.approvedCount : 0,
          memberCount: typeof d.memberCount === 'number' ? d.memberCount : 0,
          deniedByUserId: typeof d.deniedByUserId === 'number' ? d.deniedByUserId : undefined,
        },
      };
    }
    case 'vaultLeaveRequested': {
      if (typeof data !== 'object' || data === null) return null;
      const d = data as Record<string, unknown>;
      const tripId = coerceTripId(d);
      const userId = typeof d.userId === 'number' ? d.userId : null;
      if (tripId === null || userId === null) return null;
      return { event, data: { tripId, userId } };
    }
    case 'tripMemberRemoved': {
      if (typeof data !== 'object' || data === null) return null;
      const d = data as Record<string, unknown>;
      const tripId = coerceTripId(d);
      const userId = typeof d.userId === 'number' ? d.userId : null;
      if (tripId === null || userId === null) return null;
      return { event, data: { tripId, userId, displayName: asString(d.displayName) } };
    }
    case 'error': {
      if (typeof data !== 'object' || data === null) return null;
      const d = data as Record<string, unknown>;
      return { event: 'error', data: { message: asString(d.message) } };
    }
    default:
      return { event: 'unknown', name: event, data };
  }
}

export function encodeEnvelope(
  event: 'joinTrip' | 'leaveTrip',
  data: { tripId: number },
): string {
  return JSON.stringify({ event, data });
}

export function isAuthFailure(e: RealtimeEvent): boolean {
  return e.event === 'error' && /authentication failed/i.test(e.data.message);
}
