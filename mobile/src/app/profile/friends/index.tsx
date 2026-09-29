/**
 * Friends list + pending requests — port of `FriendsListView.swift`. Pending requests (when any)
 * render above the friends list; tapping a request pushes the (M3.4) request detail modal,
 * tapping a friend pushes their profile. Both cards are flattened into one recycling list
 * (`flattenFriendsRows`), one row per person.
 */
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { mutualLabel, useFriendRequests, useFriends } from '@/features/friends/api/queries';
import { FriendsEmpty, PendingRequestRow } from '@/features/friends/components';
import { flattenFriendsRows } from '@/features/friends/helpers/friendsRows';
import { useStaleFriendsRefetch } from '@/features/friends/useStaleFriendsRefetch';
import { FriendRow } from '@/features/profile/components';
import { useAppLanguage } from '@/i18n';
import { ScreenContainer, Spinner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export default function ProfileFriendsScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const friends = useFriends();
  const requests = useFriendRequests();
  useStaleFriendsRefetch();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([friends.refetch(), requests.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [friends, requests]);

  const isInitialLoading =
    (friends.isLoading && friends.data === undefined) ||
    (requests.isLoading && requests.data === undefined);
  const rows = flattenFriendsRows(requests.data ?? [], friends.data ?? []);

  return (
    <ScreenContainer style={styles.root}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title} numberOfLines={1}>
          {t('Friends')}
        </Text>
        <View style={styles.headerButton} />
      </View>

      {isInitialLoading ? (
        <View style={styles.loading} testID="friends-screen-loading">
          <Spinner fill />
        </View>
      ) : (
        <FlashList
          testID="friends-screen"
          data={rows}
          keyExtractor={(row) => row.key}
          getItemType={(row) => row.type}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            switch (item.type) {
              case 'requestLabel':
                return <Text style={styles.label}>{t('Pending Requests')}</Text>;
              case 'request':
                return (
                  <View
                    style={[
                      styles.card,
                      item.isFirst && styles.cardFirst,
                      item.isLast && styles.cardLast,
                    ]}
                  >
                    <PendingRequestRow
                      name={item.request.sender.displayName}
                      avatarUrl={item.request.sender.avatarUrl}
                      subtitle={mutualLabel(item.request.mutualFriendCount, t)}
                      onPress={() =>
                        router.push({
                          pathname: '/friend-request/[id]',
                          params: { id: String(item.request.id) },
                        })
                      }
                      testID={`friend-request-row-${item.request.id}`}
                    />
                  </View>
                );
              case 'friend':
                return (
                  <View
                    style={[
                      styles.card,
                      item.isFirst && styles.cardFirst,
                      item.isLast && styles.cardLast,
                      item.spaced && styles.blockSpaced,
                    ]}
                  >
                    <FriendRow
                      name={item.friend.user.displayName}
                      subtitle={mutualLabel(item.friend.mutualFriendCount, t)}
                      avatarUrl={item.friend.user.avatarUrl}
                      isPro={item.friend.user.isPro}
                      size={42}
                      onPress={() =>
                        router.push({
                          pathname: '/friend-profile/[userId]',
                          params: { userId: String(item.friend.user.id) },
                        })
                      }
                      testID={`friend-row-${item.friend.user.id}`}
                    />
                  </View>
                );
              case 'empty':
                return (
                  <View style={item.spaced && styles.blockSpaced}>
                    <FriendsEmpty />
                  </View>
                );
            }
          }}
        />
      )}
    </ScreenContainer>
  );
}

const CARD_RADIUS = 24;

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background },
  loading: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...beVietnamPro(17, 'medium'), color: colors.contentB, flex: 1, textAlign: 'center' },
  // Margins, not `gap`: FlashList's content container also holds its own helper views.
  content: { padding: spacing.md, paddingBottom: spacing.xxxl },
  // The friends block sits `lg` below the requests block; a label sits `sm` above its card.
  blockSpaced: { marginTop: spacing.lg },
  label: { ...beVietnamPro(14), color: colors.contentM, marginBottom: spacing.sm },
  // One card is split into a row per person; the first/last rows carry its rounded corners.
  card: { backgroundColor: colors.surface, overflow: 'hidden' },
  cardFirst: { borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS },
  cardLast: { borderBottomLeftRadius: CARD_RADIUS, borderBottomRightRadius: CARD_RADIUS },
});
