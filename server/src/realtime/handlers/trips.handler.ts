import { Injectable } from '@nestjs/common';
import { REALTIME_EVENTS } from '../constants';
import { ConnectionService } from '../connection/connection.service';

export interface TripInvitePayload {
  inviteCode: string;
  tripName: string;
  coverImageUrl: string | null;
  invitedByDisplayName: string;
}

@Injectable()
export class TripsHandler {
  constructor(private readonly connectionService: ConnectionService) {}

  sendTripInvite(userId: number, payload: TripInvitePayload): void {
    this.connectionService.sendToUser(
      userId,
      REALTIME_EVENTS.TRIP_INVITE_RECEIVED,
      payload,
    );
  }

  getOnlineUserIds(userIds: number[]): number[] {
    return this.connectionService.filterOnlineUserIds(userIds);
  }

  sendTripStarted(tripId: number): void {
    this.connectionService.broadcastToRoom(
      tripId,
      REALTIME_EVENTS.TRIP_STARTED,
      { tripId },
    );
  }

  sendTripEnded(tripId: number): void {
    this.connectionService.broadcastToRoom(tripId, REALTIME_EVENTS.TRIP_ENDED, {
      tripId,
    });
  }

  sendTripDeleted(tripId: number): void {
    this.connectionService.broadcastToRoom(
      tripId,
      REALTIME_EVENTS.TRIP_DELETED,
      { tripId },
    );
  }

  sendTripSettlementUpdated(tripId: number): void {
    this.connectionService.broadcastToRoom(
      tripId,
      REALTIME_EVENTS.TRIP_SETTLEMENT_UPDATED,
      { tripId },
    );
  }

  sendTripMemberRoleUpdated(
    tripId: number,
    payload: { userId: number; role: string },
  ): void {
    this.connectionService.broadcastToRoom(
      tripId,
      REALTIME_EVENTS.TRIP_MEMBER_ROLE_UPDATED,
      { tripId, ...payload },
    );
  }

  /** An above-threshold vault payment is waiting for a second member to approve. */
  sendVaultApprovalRequested(
    tripId: number,
    payload: {
      vaultTransactionId: number;
      amountVnd: string;
      recipientName: string;
      /// The member who raised it. The chain refuses a second signature from
      /// the same key, so they must not be asked to give one.
      proposedByUserId: number | null;
      /// Who may sign it, or null when the trip lets any member. The broadcast
      /// reaches the whole room, so it has to carry enough for each device to
      /// decide whether the question is for them.
      approverUserIds: number[] | null;
    },
  ): void {
    this.connectionService.broadcastToRoom(
      tripId,
      REALTIME_EVENTS.VAULT_APPROVAL_REQUESTED,
      { tripId, ...payload },
    );
  }

  /**
   * The group wallet moved.
   *
   * `by` says who did it and what, so a member's device can tell them rather
   * than silently changing a number they were not watching. Optional because
   * the event is also a plain "refresh yourself" — the reconcile job has no
   * actor to name.
   */
  sendVaultBalanceChanged(
    tripId: number,
    by?: {
      kind: string;
      actorUserId: number | null;
      actorName: string;
      amountMicro: string;
    },
  ): void {
    this.connectionService.broadcastToRoom(
      tripId,
      REALTIME_EVENTS.VAULT_BALANCE_CHANGED,
      { tripId, ...(by ?? {}) },
    );
  }

  /**
   * Vault settlement finished (server execute_settlement closed the vault).
   *
   * Distinct from `vaultBalanceChanged`: devices on the settlement tab need to
   * refresh cash-debt rows after the on-chain wind-up.
   */
  sendVaultSettlementUpdated(
    tripId: number,
    payload?: {
      isSettled?: boolean;
    },
  ): void {
    this.connectionService.broadcastToRoom(
      tripId,
      REALTIME_EVENTS.VAULT_SETTLEMENT_UPDATED,
      { tripId, ...(payload ?? {}) },
    );
  }

  /** End-trip consensus progress (pending votes, deny, or unanimous approve). */
  sendTripEndRequestUpdated(
    tripId: number,
    payload: {
      status: string;
      approvedCount: number;
      memberCount: number;
      deniedByUserId?: number;
    },
  ): void {
    this.connectionService.broadcastToRoom(
      tripId,
      REALTIME_EVENTS.TRIP_END_REQUEST_UPDATED,
      { tripId, ...payload },
    );
  }

  /** Member announced leave; host refreshes and opens confirm sheet. */
  sendVaultLeaveRequested(tripId: number, payload: { userId: number }): void {
    this.connectionService.broadcastToRoom(
      tripId,
      REALTIME_EVENTS.VAULT_LEAVE_REQUESTED,
      { tripId, ...payload },
    );
  }

  /** Member left or was removed; devices refresh / leaver exits trip. */
  sendTripMemberRemoved(
    tripId: number,
    payload: { userId: number; displayName: string },
  ): void {
    this.connectionService.broadcastToRoom(
      tripId,
      REALTIME_EVENTS.TRIP_MEMBER_REMOVED,
      { tripId, ...payload },
    );
  }
}
