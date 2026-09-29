/**
 * Full friend list for the "New trip" flow — port of `FriendsListView(selectedFriendIds:)`, pushed
 * from the Search pill on `CreateTripView.swift:224`. Selections write to `createTripStore`, so
 * they show as `Sent` on the create screen after popping back.
 */
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFriends } from '@/features/friends/api/queries';
import { FriendsEmpty } from '@/features/friends/components';
import { NewTripFriendRows } from '@/features/trip/components/NewTripFriendRows';
import { useAppLanguage } from '@/i18n';
import { ScreenContainer, Spinner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export default function NewTripFriendsScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const friends = useFriends();
  const rows = friends.data ?? [];

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title} numberOfLines={1}>
          {t('Friends')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {friends.isLoading && friends.data === undefined ? (
        <Spinner fill />
      ) : (
        <ScrollView contentContainerStyle={styles.content} testID="new-trip-friends-screen">
          {rows.length === 0 ? (
            <FriendsEmpty />
          ) : (
            <View style={styles.card}>
              <NewTripFriendRows friends={rows} size={42} />
            </View>
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerSpacer: { width: 40 },
  title: { ...beVietnamPro(17, 'medium'), color: colors.contentB, flex: 1, textAlign: 'center' },
  content: { padding: spacing.md, paddingBottom: spacing.xxxl },
  card: { backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden' },
});
