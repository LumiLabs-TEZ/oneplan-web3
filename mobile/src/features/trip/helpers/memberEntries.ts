/**
 * Pure row model for the trip Members tab. Port of `TripDetailView.membersTab`
 * (`TripDetailView.swift:1339-1375`) — see
 * `android/app/src/main/java/com/oneplan/feature/trip/components/MembersSection.kt`
 * (`computeMemberRowState`) for the Android equivalent.
 */
import type { FriendDto } from '@/features/friends/types';

import type { InviteStatus, TripMemberDto, TripMemberRole } from '../types';

export type FriendAction = 'friend' | 'add' | null;

export interface MemberEntry {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  isPro: boolean;
  isSelf: boolean;
  isFriend: boolean;
  mutualFriendCount: number;
  friendCode: string | null;
  /** `null` for self — the trailing pill is hidden entirely on your own row. */
  friendAction: FriendAction;
  inviteStatus: InviteStatus;
  role: TripMemberRole;
}

export interface MemberEntriesOptions {
  currentUserId: number;
  friends: FriendDto[];
  /** Self's Pro status (`useIsPro`) — other members' Pro status comes from `friends`. */
  currentUserIsPro: boolean;
}

/** ACCEPTED members first, then PENDING — relative order within each group is preserved. */
export function memberEntries(
  members: TripMemberDto[],
  { currentUserId, friends, currentUserIsPro }: MemberEntriesOptions,
): MemberEntry[] {
  const friendByUserId = new Map(friends.map((f) => [f.user.id, f]));

  const toEntry = (member: TripMemberDto): MemberEntry => {
    const isSelf = member.userId === currentUserId;
    const friend = friendByUserId.get(member.userId);
    const isFriend = isSelf || friend !== undefined;
    const isPro = isSelf ? currentUserIsPro : (friend?.user.isPro ?? member.isPro);

    return {
      userId: member.userId,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl ?? null,
      isPro,
      isSelf,
      isFriend,
      mutualFriendCount: friend?.mutualFriendCount ?? 0,
      friendCode: member.friendCode ?? null,
      friendAction: isSelf ? null : isFriend ? 'friend' : 'add',
      inviteStatus: member.inviteStatus,
      role: member.role,
    };
  };

  const accepted = members.filter((m) => m.inviteStatus === 'ACCEPTED').map(toEntry);
  const pending = members.filter((m) => m.inviteStatus !== 'ACCEPTED').map(toEntry);
  return [...accepted, ...pending];
}
