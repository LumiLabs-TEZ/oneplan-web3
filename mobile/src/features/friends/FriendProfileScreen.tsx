/**
 * Friend profile — port of `FriendProfileView.swift`. Header photo runs full-bleed behind the
 * avatar/name/action-area card; tabs switch between the friend's friend list and their public
 * plans (Phase 7 — rendered as a "No plans yet" placeholder here).
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { PublicPlans } from '@/features/market/components/PublicPlans';
import { useFriendProfile } from '@/features/friends/api/queries';
import {
  useCancelFriendRequest,
  useRespondFriendRequest,
  useSendFriendRequest,
  useUnfriend,
} from '@/features/friends/api/mutations';
import {
  FriendProfileHeader,
  FriendProfileTabs,
  MetricPill,
  type FriendProfileTabValue,
} from '@/features/friends/components';
import type { FriendProfileAction } from '@/features/friends/helpers/requestActions';
import {
  confirmRemoveFriend,
  presentFriendProfileMenu,
} from '@/features/friends/helpers/removeFriendPrompt';
import { FriendRow } from '@/features/profile/components';
import { useAppLanguage } from '@/i18n';
import { requireOnline } from '@/offline/guardOnline';
import { images } from '@/ui/assets';
import { ScreenContainer, Spinner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';

/** `friendProfileHeaderBackground.png` pixel size — drawn full width at its own aspect. */
const HEADER_IMAGE_WIDTH = 786;
const HEADER_IMAGE_HEIGHT = 765;

export default function FriendProfileScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ userId: string }>();
  const userId = Number(params.userId);
  const profileQuery = useFriendProfile(Number.isFinite(userId) ? userId : undefined);
  const profile = profileQuery.data;

  const [tab, setTab] = useState<FriendProfileTabValue>('friends');
  const { width: windowWidth } = useWindowDimensions();
  // Presented as a sheet (swipe to dismiss, no back button — as iOS) whenever something sits
  // below it in its stack; only a cold deep link that lands on it first keeps the back chevron.
  const navigation = useNavigation();
  const isSheet = (navigation.getState()?.index ?? 0) > 0;

  const sendRequest = useSendFriendRequest();
  const cancelRequest = useCancelFriendRequest();
  const respondRequest = useRespondFriendRequest();
  const unfriend = useUnfriend();

  const isPerformingAction =
    sendRequest.isPending ||
    cancelRequest.isPending ||
    respondRequest.isPending ||
    unfriend.isPending;

  const handleAction = async (action: FriendProfileAction) => {
    if (!profile) return;
    if (!requireOnline(t)) return;
    try {
      switch (action) {
        case 'add':
          if (!profile.friendCode) return;
          await sendRequest.mutateAsync(profile.friendCode);
          await profileQuery.refetch();
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => undefined,
          );
          break;
        case 'cancel':
          if (!profile.friendCode) return;
          await cancelRequest.mutateAsync(profile.friendCode);
          await profileQuery.refetch();
          break;
        case 'accept':
          if (profile.friendRequestId == null) return;
          await respondRequest.mutateAsync({ id: profile.friendRequestId, accept: true });
          await profileQuery.refetch();
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => undefined,
          );
          break;
        case 'decline':
          if (profile.friendRequestId == null) return;
          await respondRequest.mutateAsync({ id: profile.friendRequestId, accept: false });
          await profileQuery.refetch();
          break;
      }
    } catch {
      Alert.alert(t('Something went wrong'));
    }
  };

  const handleRemove = async () => {
    if (!profile?.friendshipId) return;
    if (!requireOnline(t)) return;
    try {
      await unfriend.mutateAsync(profile.friendshipId);
      router.back();
    } catch {
      Alert.alert(t('Something went wrong'));
    }
  };

  const confirmRemove = () => {
    confirmRemoveFriend(t, profile?.displayName ?? '', () => void handleRemove());
  };

  const presentMenu = () => {
    presentFriendProfileMenu(t, profile?.displayName ?? '', confirmRemove);
  };

  return (
    <View style={styles.root} testID="friend-profile-screen">
      <ScreenContainer edges={[]} style={styles.container}>
        <View style={[styles.topBar, { paddingTop: 12 }]}>
          {isSheet ? <View style={styles.headerButton} /> : <BackButton />}
          {profile?.requestStatus === 'friends' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Remove friend')}
              onPress={presentMenu}
              testID="friend-profile-menu"
              style={styles.headerButton}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.contentB} />
            </Pressable>
          ) : (
            <View style={styles.headerButton} />
          )}
        </View>

        {!profile ? (
          <Spinner fill />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
            <View>
              {/* `.scaledToFit()` full-width photo under the content (`ZStack`), never cropped. */}
              <Image
                source={images.friends.profileHeaderBackground}
                style={[
                  styles.headerBackground,
                  { height: (windowWidth * HEADER_IMAGE_HEIGHT) / HEADER_IMAGE_WIDTH },
                ]}
                resizeMode="cover"
                accessible={false}
                importantForAccessibility="no"
              />

              <View style={styles.content}>
                <FriendProfileHeader
                  displayName={profile.displayName}
                  avatarUrl={profile.avatarUrl}
                  friendCode={profile.friendCode}
                  requestStatus={profile.requestStatus}
                  isPerformingAction={isPerformingAction}
                  isPro={profile.isPro}
                  onAction={(action) => void handleAction(action)}
                />

                <View style={styles.metrics}>
                  <MetricPill
                    title={t('Trips')}
                    value={profile.tripCount}
                    minimumIntegerDigits={2}
                  />
                  <MetricPill
                    title={t('Cities')}
                    value={profile.cityCount}
                    minimumIntegerDigits={2}
                  />
                </View>

                <View style={styles.tabSection}>
                  <FriendProfileTabs value={tab} onChange={setTab} />

                  {tab === 'friends' ? (
                    profile.friends.length > 0 ? (
                      <View style={styles.friendsList}>
                        {profile.friends.map((friend) => (
                          <FriendRow
                            key={friend.userId}
                            style={styles.friendRow}
                            name={friend.displayName}
                            subtitle={t('%lld friends (%lld mutuals)', {
                              0: friend.friendCount,
                              1: friend.mutualFriendCount,
                            })}
                            avatarUrl={friend.avatarUrl}
                            isPro={friend.isPro}
                          />
                        ))}
                      </View>
                    ) : null
                  ) : (
                    <PublicPlans userId={userId} />
                  )}
                </View>
              </View>
            </View>
          </ScrollView>
        )}
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  container: { backgroundColor: colors.background },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
  },
  content: {
    paddingTop: 150,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
    alignItems: 'center',
  },
  metrics: { flexDirection: 'row', gap: 4 },
  tabSection: { width: '100%', gap: spacing.sm, alignItems: 'flex-start' },
  // `FriendList.swift`: one white card (radius 24), rows inset 14/10.
  friendsList: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
  },
  friendRow: { paddingHorizontal: 14, paddingVertical: 10 },
});
