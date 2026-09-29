export const REALTIME_EVENTS = {
  NEW_MESSAGE: 'newMessage',
  FRIEND_REQUEST_RECEIVED: 'friendRequestReceived',
  FRIEND_REQUEST_ACCEPTED: 'friendRequestAccepted',
  TRIP_INVITE_RECEIVED: 'tripInviteReceived',
  TRIP_STARTED: 'tripStarted',
  TRIP_ENDED: 'tripEnded',
  TRIP_DELETED: 'tripDeleted',
  TRIP_SETTLEMENT_UPDATED: 'tripSettlementUpdated',
  /** A trip member's role changed (e.g. appointed or removed as co-host). */
  TRIP_MEMBER_ROLE_UPDATED: 'tripMemberRoleUpdated',
  VAULT_APPROVAL_REQUESTED: 'vaultApprovalRequested',
  VAULT_BALANCE_CHANGED: 'vaultBalanceChanged',
  /** Vault settlement proposed or an approval landed (including the final one). */
  VAULT_SETTLEMENT_UPDATED: 'vaultSettlementUpdated',
  /** End-trip consensus request created, voted, approved, or denied. */
  TRIP_END_REQUEST_UPDATED: 'tripEndRequestUpdated',
  /** Member announced vault leave; host should confirm. */
  VAULT_LEAVE_REQUESTED: 'vaultLeaveRequested',
  /** Member removed from trip (leave confirm, kick, or self-leave). */
  TRIP_MEMBER_REMOVED: 'tripMemberRemoved',
  ERROR: 'error',
} as const;
