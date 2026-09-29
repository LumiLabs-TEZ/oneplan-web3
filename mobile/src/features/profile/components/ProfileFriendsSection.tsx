/** Port of `ProfileView.swift:480` — friend-requests block + "Your friends" list, wrapped in a
 * single tap target that opens the full friends list screen. */
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FriendDto, FriendRequestDto } from '@/features/friends/types';
import { useAppLanguage } from '@/i18n';
import { NumericText } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { friendsToRows, requestsToRows } from '../helpers/profileLabels';
import { FriendRow } from './FriendRow';

export interface ProfileFriendsSectionProps {
  requests: FriendRequestDto[];
  friends: FriendDto[];
  onOpenList: () => void;
  testID?: string;
}

export function ProfileFriendsSection({
  requests,
  friends,
  onOpenList,
  testID,
}: ProfileFriendsSectionProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const requestRows = requestsToRows(requests, t);
  const friendRows = friendsToRows(friends, t);

  return (
    <Pressable accessibilityRole="button" onPress={onOpenList} testID={testID}>
      <View style={styles.root}>
        {requests.length > 0 ? (
          <View style={styles.block}>
            <View style={styles.blockHeader}>
              <Text style={styles.label}>{t('Friend requests')}</Text>
              <View style={styles.countBadge}>
                <NumericText value={requests.length} style={styles.countText} />
              </View>
            </View>
            {requestRows.map((row) => (
              <FriendRow
                key={row.id}
                name={row.name}
                subtitle={row.subtitle}
                avatarUrl={row.avatarUrl}
                isPro={row.isPro}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={styles.label}>{t('Your friends')}</Text>
          {friends.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('No friends yet')}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {friendRows.map((row) => (
                <FriendRow
                  key={row.id}
                  name={row.name}
                  subtitle={row.subtitle}
                  avatarUrl={row.avatarUrl}
                  isPro={row.isPro}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  block: { gap: spacing.sm },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...beVietnamPro(14), letterSpacing: -0.6, color: colors.contentM },
  // `FriendList.swift`: one white card, no row gaps.
  list: { backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden' },
  countBadge: {
    borderRadius: 999,
    backgroundColor: colors.blueBase,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  countText: { ...beVietnamPro(12, 'medium'), color: colors.white },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    backgroundColor: colors.surface,
    borderRadius: 24,
  },
  emptyText: { ...beVietnamPro(14), color: colors.contentM },
});
