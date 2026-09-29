/**
 * Pure view-model helpers for the Profile screen — kept out of the components so the
 * friend-code / display-name / row-mapping rules are unit-testable without rendering.
 */
import type { TFunction } from 'i18next';

import { mutualLabel } from '@/features/friends/api/queries';
import type { FriendDto, FriendRequestDto } from '@/features/friends/types';

/**
 * Locked UI mock (Phase 4 constraints): the friend-code line under the display name always
 * renders this literal text, never the real `UserProfileDto.friendCode` — matches iOS
 * `ProfileInfoCard`'s hardcoded `"OP-2006-2710"` (`ProfileView.swift:294`).
 */
export const LOCKED_FRIEND_CODE_LABEL = 'OP-2006-2710';

/** `profile?.displayName ?? String(localized: "One Plan User")` (`ProfileView.swift:290`). */
export function resolveDisplayName(
  displayName: string | null | undefined,
  fallback: string,
): string {
  return displayName && displayName.trim().length > 0 ? displayName : fallback;
}

export interface FriendRowViewModel {
  id: string;
  name: string;
  subtitle: string;
  avatarUrl: string | null | undefined;
  isPro: boolean;
}

/** Maps `GET /friends` rows for `ProfileFriendsSection`'s "Your friends" list. */
export function friendsToRows(friends: FriendDto[], t: TFunction): FriendRowViewModel[] {
  return friends.map((friend) => ({
    id: String(friend.friendshipId),
    name: friend.user.displayName,
    subtitle: mutualLabel(friend.mutualFriendCount, t),
    avatarUrl: friend.user.avatarUrl,
    isPro: friend.user.isPro,
  }));
}

/**
 * Maps `GET /friends/requests` rows for the "Friend requests" list. `id` is prefixed
 * (`request-{id}`) to mirror `FriendListEntry(id: "request-\(request.id)")` — the sender's user
 * id and a friend's `friendshipId` can otherwise collide across the two lists.
 */
export function requestsToRows(requests: FriendRequestDto[], t: TFunction): FriendRowViewModel[] {
  return requests.map((request) => ({
    id: `request-${request.id}`,
    name: request.sender.displayName,
    subtitle: mutualLabel(request.mutualFriendCount, t),
    avatarUrl: request.sender.avatarUrl,
    isPro: request.sender.isPro,
  }));
}
