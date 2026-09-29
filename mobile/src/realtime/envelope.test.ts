/** @jest-environment node */
import { encodeEnvelope, isAuthFailure, parseEnvelope } from './envelope';

describe('parseEnvelope', () => {
  it('returns null for non-JSON input', () => {
    expect(parseEnvelope('not json')).toBeNull();
  });

  it('returns null when event is missing', () => {
    expect(parseEnvelope(JSON.stringify({ data: {} }))).toBeNull();
  });

  it('returns null when event is not a string', () => {
    expect(parseEnvelope(JSON.stringify({ event: 42, data: {} }))).toBeNull();
  });

  it('maps unknown event names to the unknown variant', () => {
    expect(parseEnvelope(JSON.stringify({ event: 'somethingElse', data: { a: 1 } }))).toEqual({
      event: 'unknown',
      name: 'somethingElse',
      data: { a: 1 },
    });
  });

  it('coerces a numeric-string tripId to a positive integer', () => {
    expect(parseEnvelope(JSON.stringify({ event: 'tripEnded', data: { tripId: '12' } }))).toEqual({
      event: 'tripEnded',
      data: { tripId: 12 },
    });
  });

  it('coerces a numeric tripId', () => {
    expect(
      parseEnvelope(JSON.stringify({ event: 'tripDeleted', data: { tripId: 7 } })),
    ).toEqual({ event: 'tripDeleted', data: { tripId: 7 } });
    expect(
      parseEnvelope(JSON.stringify({ event: 'tripSettlementUpdated', data: { tripId: 3 } })),
    ).toEqual({ event: 'tripSettlementUpdated', data: { tripId: 3 } });
  });

  it('returns null when tripId is not a positive integer', () => {
    expect(parseEnvelope(JSON.stringify({ event: 'tripEnded', data: { tripId: 'abc' } }))).toBeNull();
    expect(parseEnvelope(JSON.stringify({ event: 'tripEnded', data: { tripId: -1 } }))).toBeNull();
    expect(parseEnvelope(JSON.stringify({ event: 'tripEnded', data: { tripId: 0 } }))).toBeNull();
    expect(parseEnvelope(JSON.stringify({ event: 'tripEnded', data: {} }))).toBeNull();
    expect(parseEnvelope(JSON.stringify({ event: 'tripEnded', data: { tripId: 1.5 } }))).toBeNull();
  });

  it('parses tripInviteReceived requiring a non-empty inviteCode', () => {
    expect(
      parseEnvelope(
        JSON.stringify({
          event: 'tripInviteReceived',
          data: {
            inviteCode: 'ABC123',
            tripName: 'Trip',
            coverImageUrl: 'https://x/y.png',
            invitedByDisplayName: 'Ken',
          },
        }),
      ),
    ).toEqual({
      event: 'tripInviteReceived',
      data: {
        inviteCode: 'ABC123',
        tripName: 'Trip',
        coverImageUrl: 'https://x/y.png',
        invitedByDisplayName: 'Ken',
      },
    });
  });

  it('returns null when tripInviteReceived is missing inviteCode', () => {
    expect(
      parseEnvelope(JSON.stringify({ event: 'tripInviteReceived', data: {} })),
    ).toBeNull();
    expect(
      parseEnvelope(
        JSON.stringify({ event: 'tripInviteReceived', data: { inviteCode: '' } }),
      ),
    ).toBeNull();
  });

  it('normalises tripInviteReceived coverImageUrl to string|null and defaults other strings to empty', () => {
    expect(
      parseEnvelope(
        JSON.stringify({ event: 'tripInviteReceived', data: { inviteCode: 'X' } }),
      ),
    ).toEqual({
      event: 'tripInviteReceived',
      data: {
        inviteCode: 'X',
        tripName: '',
        coverImageUrl: null,
        invitedByDisplayName: '',
      },
    });

    expect(
      parseEnvelope(
        JSON.stringify({
          event: 'tripInviteReceived',
          data: { inviteCode: 'X', coverImageUrl: 42 },
        }),
      ),
    ).toEqual({
      event: 'tripInviteReceived',
      data: {
        inviteCode: 'X',
        tripName: '',
        coverImageUrl: null,
        invitedByDisplayName: '',
      },
    });
  });

  it('passes through friendRequestReceived data unchanged', () => {
    expect(
      parseEnvelope(JSON.stringify({ event: 'friendRequestReceived', data: { foo: 'bar' } })),
    ).toEqual({ event: 'friendRequestReceived', data: { foo: 'bar' } });
  });

  it('parses friendRequestAccepted', () => {
    expect(
      parseEnvelope(
        JSON.stringify({ event: 'friendRequestAccepted', data: { acceptedBy: 'Ken' } }),
      ),
    ).toEqual({ event: 'friendRequestAccepted', data: { acceptedBy: 'Ken' } });
  });

  it('parses tripMemberRoleUpdated', () => {
    expect(
      parseEnvelope(
        JSON.stringify({
          event: 'tripMemberRoleUpdated',
          data: { tripId: 5, userId: 9, role: 'CO_HOST' },
        }),
      ),
    ).toEqual({ event: 'tripMemberRoleUpdated', data: { tripId: 5, userId: 9, role: 'CO_HOST' } });
  });

  it('returns null when tripMemberRoleUpdated is missing userId', () => {
    expect(
      parseEnvelope(
        JSON.stringify({ event: 'tripMemberRoleUpdated', data: { tripId: 5, role: 'CO_HOST' } }),
      ),
    ).toBeNull();
  });

  it('parses vaultApprovalRequested, defaulting approverUserIds to null and filtering non-numbers', () => {
    expect(
      parseEnvelope(
        JSON.stringify({
          event: 'vaultApprovalRequested',
          data: {
            tripId: 5,
            vaultTransactionId: 99,
            amountVnd: '500000',
            recipientName: 'Nguyen Van A',
            proposedByUserId: 3,
            approverUserIds: [4, 5, 'oops'],
          },
        }),
      ),
    ).toEqual({
      event: 'vaultApprovalRequested',
      data: {
        tripId: 5,
        vaultTransactionId: 99,
        amountVnd: '500000',
        recipientName: 'Nguyen Van A',
        proposedByUserId: 3,
        approverUserIds: [4, 5],
      },
    });

    expect(
      parseEnvelope(
        JSON.stringify({
          event: 'vaultApprovalRequested',
          data: { tripId: 5, vaultTransactionId: 99, proposedByUserId: null },
        }),
      ),
    ).toEqual({
      event: 'vaultApprovalRequested',
      data: {
        tripId: 5,
        vaultTransactionId: 99,
        amountVnd: '',
        recipientName: '',
        proposedByUserId: null,
        approverUserIds: null,
      },
    });
  });

  it('returns null when vaultApprovalRequested is missing vaultTransactionId', () => {
    expect(
      parseEnvelope(JSON.stringify({ event: 'vaultApprovalRequested', data: { tripId: 5 } })),
    ).toBeNull();
  });

  it('parses vaultBalanceChanged with and without an actor', () => {
    expect(
      parseEnvelope(
        JSON.stringify({
          event: 'vaultBalanceChanged',
          data: { tripId: 5, kind: 'deposit', actorUserId: 3, actorName: 'Ken', amountMicro: '1000000' },
        }),
      ),
    ).toEqual({
      event: 'vaultBalanceChanged',
      data: { tripId: 5, kind: 'deposit', actorUserId: 3, actorName: 'Ken', amountMicro: '1000000' },
    });

    expect(parseEnvelope(JSON.stringify({ event: 'vaultBalanceChanged', data: { tripId: 5 } }))).toEqual({
      event: 'vaultBalanceChanged',
      data: { tripId: 5, kind: undefined, actorUserId: null, actorName: undefined, amountMicro: undefined },
    });
  });

  it('parses vaultSettlementUpdated with and without isSettled', () => {
    expect(
      parseEnvelope(
        JSON.stringify({ event: 'vaultSettlementUpdated', data: { tripId: 5, isSettled: true } }),
      ),
    ).toEqual({ event: 'vaultSettlementUpdated', data: { tripId: 5, isSettled: true } });
    expect(
      parseEnvelope(JSON.stringify({ event: 'vaultSettlementUpdated', data: { tripId: 5 } })),
    ).toEqual({ event: 'vaultSettlementUpdated', data: { tripId: 5, isSettled: undefined } });
  });

  it('parses tripEndRequestUpdated', () => {
    expect(
      parseEnvelope(
        JSON.stringify({
          event: 'tripEndRequestUpdated',
          data: { tripId: 5, status: 'PENDING', approvedCount: 2, memberCount: 4 },
        }),
      ),
    ).toEqual({
      event: 'tripEndRequestUpdated',
      data: { tripId: 5, status: 'PENDING', approvedCount: 2, memberCount: 4, deniedByUserId: undefined },
    });
  });

  it('parses vaultLeaveRequested', () => {
    expect(
      parseEnvelope(JSON.stringify({ event: 'vaultLeaveRequested', data: { tripId: 5, userId: 9 } })),
    ).toEqual({ event: 'vaultLeaveRequested', data: { tripId: 5, userId: 9 } });
  });

  it('parses tripMemberRemoved', () => {
    expect(
      parseEnvelope(
        JSON.stringify({
          event: 'tripMemberRemoved',
          data: { tripId: 5, userId: 9, displayName: 'Ken' },
        }),
      ),
    ).toEqual({ event: 'tripMemberRemoved', data: { tripId: 5, userId: 9, displayName: 'Ken' } });
  });

  it('parses error events', () => {
    expect(
      parseEnvelope(JSON.stringify({ event: 'error', data: { message: 'Authentication failed' } })),
    ).toEqual({ event: 'error', data: { message: 'Authentication failed' } });
  });

  it('parses vaultLeaveRequested requiring both tripId and userId', () => {
    expect(
      parseEnvelope(JSON.stringify({ event: 'vaultLeaveRequested', data: { tripId: 5, userId: 9 } })),
    ).toEqual({ event: 'vaultLeaveRequested', data: { tripId: 5, userId: 9 } });
    expect(parseEnvelope(JSON.stringify({ event: 'vaultLeaveRequested', data: { tripId: 5 } }))).toBeNull();
    expect(parseEnvelope(JSON.stringify({ event: 'vaultLeaveRequested', data: { userId: 9 } }))).toBeNull();
  });

  it('parses tripMemberRemoved with tripId, userId, and displayName', () => {
    expect(
      parseEnvelope(
        JSON.stringify({
          event: 'tripMemberRemoved',
          data: { tripId: 5, userId: 9, displayName: 'Ken' },
        }),
      ),
    ).toEqual({ event: 'tripMemberRemoved', data: { tripId: 5, userId: 9, displayName: 'Ken' } });
    expect(
      parseEnvelope(JSON.stringify({ event: 'tripMemberRemoved', data: { tripId: 5 } })),
    ).toBeNull();
  });

  it('parses tripMemberRoleUpdated with tripId, userId, and role', () => {
    expect(
      parseEnvelope(
        JSON.stringify({
          event: 'tripMemberRoleUpdated',
          data: { tripId: 5, userId: 9, role: 'CO_HOST' },
        }),
      ),
    ).toEqual({ event: 'tripMemberRoleUpdated', data: { tripId: 5, userId: 9, role: 'CO_HOST' } });
    expect(
      parseEnvelope(JSON.stringify({ event: 'tripMemberRoleUpdated', data: { tripId: 5 } })),
    ).toBeNull();
  });

  it('round-trips an encoded envelope', () => {
    const raw = encodeEnvelope('joinTrip', { tripId: 42 });
    expect(JSON.parse(raw)).toEqual({ event: 'joinTrip', data: { tripId: 42 } });
  });
});

describe('encodeEnvelope', () => {
  it('encodes joinTrip', () => {
    expect(encodeEnvelope('joinTrip', { tripId: 5 })).toBe(
      JSON.stringify({ event: 'joinTrip', data: { tripId: 5 } }),
    );
  });

  it('encodes leaveTrip', () => {
    expect(encodeEnvelope('leaveTrip', { tripId: 5 })).toBe(
      JSON.stringify({ event: 'leaveTrip', data: { tripId: 5 } }),
    );
  });
});

describe('isAuthFailure', () => {
  it('is true for an error event with an authentication failed message', () => {
    expect(
      isAuthFailure({ event: 'error', data: { message: 'Authentication failed' } }),
    ).toBe(true);
    expect(
      isAuthFailure({ event: 'error', data: { message: 'authentication FAILED, retry' } }),
    ).toBe(true);
  });

  it('is false for other error messages', () => {
    expect(isAuthFailure({ event: 'error', data: { message: 'boom' } })).toBe(false);
  });

  it('is false for non-error events', () => {
    expect(isAuthFailure({ event: 'tripEnded', data: { tripId: 1 } })).toBe(false);
  });
});
