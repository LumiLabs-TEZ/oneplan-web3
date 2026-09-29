/**
 * Friends section on the trip-invite screen — port of `TripInviteView.swift:16-90`'s
 * `friendEntries` + `inviteFriend`. Lists friends who aren't already a trip member (accepted or
 * pending); tapping `Invite` posts `POST /trips/{id}/invite` and flips that row to a disabled
 * `Sent` pill. A local in-flight set blocks double taps while a request is outstanding, and a
 * local "sent" set keeps the row showing `Sent` immediately, ahead of the trip-detail refetch
 * that will eventually drop the row entirely (the friend becomes an existing member).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

import { mutationErrorMessage } from '@/api/mutationError';
import { mutualLabel, useFriends } from '@/features/friends/api/queries';
import { FriendRow } from '@/features/profile/components';
import { useInviteMembers } from '@/features/trip/api/inviteMembers';
import type { TripMemberDto } from '@/features/trip/types';
import { useAppLanguage } from '@/i18n';
import { SectionHeader } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';

export interface TripInviteFriendsProps {
  tripId: number;
  members: TripMemberDto[];
  style?: StyleProp<ViewStyle>;
}

export function TripInviteFriends({ tripId, members, style }: TripInviteFriendsProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const friendsQuery = useFriends();
  const inviteMembers = useInviteMembers(tripId);
  const [sendingIds, setSendingIds] = useState<Set<number>>(new Set());
  const [sentIds, setSentIds] = useState<Set<number>>(new Set());

  const existingMemberIds = new Set(members.map((m) => m.userId));
  const friends = (friendsQuery.data ?? []).filter((f) => !existingMemberIds.has(f.user.id));

  if (friends.length === 0) return null;

  const handleInvite = async (userId: number) => {
    if (sendingIds.has(userId) || sentIds.has(userId)) return;
    setSendingIds((prev) => new Set(prev).add(userId));
    try {
      await inviteMembers.mutateAsync([userId]);
      setSentIds((prev) => new Set(prev).add(userId));
    } catch (err) {
      Alert.alert(mutationErrorMessage(err, t('Something went wrong')));
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  return (
    <View style={[styles.root, style]}>
      <SectionHeader title={t('Friends')} />
      <View style={styles.card}>
        {friends.map((friend) => {
          const userId = friend.user.id;
          const isSent = sentIds.has(userId);
          return (
            <FriendRow
              key={userId}
              name={friend.user.displayName}
              subtitle={mutualLabel(friend.mutualFriendCount, t)}
              avatarUrl={friend.user.avatarUrl}
              isPro={friend.user.isPro}
              trailing={{
                label: isSent ? t('Sent') : t('Invite'),
                disabled: isSent || sendingIds.has(userId),
                onPress: () => void handleInvite(userId),
              }}
              testID={`invite-friend-${userId}`}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    paddingHorizontal: 14,
  },
});
