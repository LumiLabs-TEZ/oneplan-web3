/**
 * Invite rows on the "New trip" flow — port of `CreateTripView.swift:54-65` / `FriendsListView`'s
 * invite mode. Nothing is sent here: `Invite` only marks the friend in `createTripStore`, and the
 * screen invites every marked friend once the trip exists (`CreateTripView.swift:376-388`).
 */
import { useTranslation } from 'react-i18next';

import { mutualLabel } from '@/features/friends/api/queries';
import type { FriendDto } from '@/features/friends/types';
import { FriendRow } from '@/features/profile/components';
import { useCreateTripStore } from '@/features/trip/createTripStore';
import { useAppLanguage } from '@/i18n';

export interface NewTripFriendRowsProps {
  friends: FriendDto[];
  /** Avatar side — the create screen uses the default 48, the full list 42 (iOS parity). */
  size?: number;
}

export function NewTripFriendRows({ friends, size }: NewTripFriendRowsProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const selectedFriendIds = useCreateTripStore((s) => s.selectedFriendIds);
  const addFriend = useCreateTripStore((s) => s.addFriend);

  return friends.map((friend) => {
    const userId = friend.user.id;
    const isSelected = selectedFriendIds.includes(userId);
    return (
      <FriendRow
        key={userId}
        name={friend.user.displayName}
        subtitle={mutualLabel(friend.mutualFriendCount, t)}
        avatarUrl={friend.user.avatarUrl}
        isPro={friend.user.isPro}
        size={size}
        trailing={{
          label: isSelected ? t('Sent') : t('Invite'),
          disabled: isSelected,
          onPress: () => addFriend(userId),
        }}
        testID={`new-trip-friend-${userId}`}
      />
    );
  });
}
