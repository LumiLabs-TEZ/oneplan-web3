/**
 * Which action buttons the friend-profile action area shows for a given request status.
 * Port of `FriendProfileHeaderSection.actionArea(for:)` (`FriendProfileView.swift:391-423`).
 */
import type { FriendRequestStatus } from '../types';

export type FriendProfileAction = 'add' | 'cancel' | 'accept' | 'decline';

export function actionsFor(status: FriendRequestStatus): FriendProfileAction[] {
  switch (status) {
    case 'none':
      return ['add'];
    case 'pending_sent':
      return ['cancel'];
    case 'pending_received':
      return ['accept', 'decline'];
    case 'friends':
      return [];
  }
}
