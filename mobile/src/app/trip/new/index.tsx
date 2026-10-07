/**
 * "New trip" — port of `CreateTripView.swift:71-327`. Cover picker → name → location row →
 * duration row → friends card (Search pill, first 5 friends, Create Trip). Submit flow ports
 * `CreateTripView.swift:329-408`: create, fire-and-forget cover upload, then invite every friend
 * marked `Sent`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { mutationErrorMessage } from '@/api/mutationError';
import { keys } from '@/api/keys';
import { useFriends } from '@/features/friends/api/queries';
import { isWeb3UnavailableError } from '@/features/invite/helpers/joinConflict';
import { inviteMembers } from '@/features/trip/api/inviteMembers';
import { invalidateTrip, useCreateTrip } from '@/features/trip/api/mutations';
import { useTrips } from '@/features/trip/api/queries';
import { createTripStore, useCreateTripStore } from '@/features/trip/createTripStore';
import { NewTripFriendRows } from '@/features/trip/components/NewTripFriendRows';
import {
  TripDurationSheet,
  type TripDurationSheetRef,
} from '@/features/trip/components/TripDurationSheet';
import { buildCreateTripBody, canCreatePlanningTrip } from '@/features/trip/helpers/createTripGate';
import { FREE_PLANNING_TRIP_LIMIT } from '@/features/shell/quickActions';
import { formatMonthDay } from '@/features/trip/helpers/dateRange';
import { partitionTrips } from '@/features/trip/helpers/partitionTrips';
import { locationSelectionText } from '@/features/location/helpers/locationLabel';
import { useIsPro } from '@/features/me/useMe';
import { useWeb3Enabled } from '@/features/vault/web3Flag';
import { useAppLanguage } from '@/i18n';
import { pickImage } from '@/native/imagePick';
import { requireOnline } from '@/offline/guardOnline';
import { uploadImage } from '@/uploads/uploadService';
import { svg } from '@/ui/assets';
import { Button, ScreenContainer, SFSymbol } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/** `CreateTripView.displayedFriendEntries` shows only the first five; Search opens the full list. */
const PREVIEW_FRIEND_COUNT = 5;

export default function NewTripScreen() {
  const language = useAppLanguage();
  const { t } = useTranslation();
  const isPro = useIsPro();
  // Account-level eligibility (non-VN IP or admin allowlist, server kill switch on) — the group
  // wallet switch is only offered to eligible users.
  const web3Enabled = useWeb3Enabled();
  const trips = useTrips();
  const createTrip = useCreateTrip();
  const friends = useFriends();
  const queryClient = useQueryClient();
  const durationSheetRef = useRef<TripDurationSheetRef>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = useCreateTripStore((s) => s.name);
  const location = useCreateTripStore((s) => s.location);
  const range = useCreateTripStore((s) => s.range);
  const hasSelectedDuration = useCreateTripStore((s) => s.hasSelectedDuration);
  const coverUri = useCreateTripStore((s) => s.coverUri);
  const selectedFriendIds = useCreateTripStore((s) => s.selectedFriendIds);
  const setName = useCreateTripStore((s) => s.setName);
  const setRange = useCreateTripStore((s) => s.setRange);
  const setCoverUri = useCreateTripStore((s) => s.setCoverUri);
  const web3 = useCreateTripStore((s) => s.web3);
  const setWeb3 = useCreateTripStore((s) => s.setWeb3);

  // Discard the draft whenever this screen goes away — dismiss button, swipe-down, hardware
  // back, or (harmlessly, since it's already reset) the success path's `router.replace`. The
  // nested `/trip/new/location` modal is a child route of this Stack, so pushing/popping it
  // does not unmount `index` — only leaving `trip/new` entirely does. Mirrors the SwiftUI sheet
  // being dismissed, which discards its `@State` (`CreateTripView.swift`).
  useEffect(() => {
    return () => createTripStore.reset();
  }, []);

  // Never ask for a group wallet if eligibility turned off after the switch was flipped.
  const body = buildCreateTripBody({
    name,
    location,
    range,
    hasSelectedDuration,
    web3: web3Enabled && web3,
  });
  const friendRows = friends.data ?? [];
  const createDisabled = submitting || !body;

  const durationText =
    hasSelectedDuration && range.start
      ? `${formatMonthDay(range.start, language)}-${formatMonthDay(range.end ?? range.start, language)}`
      : null;

  const pickCover = async () => {
    const uri = await pickImage();
    if (uri) setCoverUri(uri);
  };

  const handleCreate = async () => {
    if (submitting || !body) return;
    if (!requireOnline(t)) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!isPro) {
        const refetched = await trips.refetch();
        const planningCount = partitionTrips(refetched.data ?? []).planning.length;
        if (!canCreatePlanningTrip(isPro, planningCount)) {
          // Say *why* the paywall is coming up — a silent jump to `/paywall` reads as a bug
          // (`CreateTripView.swift` shows the same cap copy before presenting the sheet).
          Alert.alert(
            t('Upgrade to Pro'),
            t('Free users can only have up to %lld planning trips.', {
              0: FREE_PLANNING_TRIP_LIMIT,
            }),
            [
              { text: t('Cancel'), style: 'cancel' },
              { text: t('Upgrade to Pro'), onPress: () => router.push('/paywall') },
            ],
          );
          return;
        }
      }

      const trip = await createTrip.mutateAsync(body);

      if (coverUri) {
        // Fire-and-forget: the trip is already created, so a failed cover upload shouldn't
        // block navigation — HomeCard's own cover picker lets the user retry later.
        void uploadImage({ uri: coverUri, target: 'trip-cover', entityId: trip.id })
          .then(() => invalidateTrip(queryClient, trip.id))
          .catch(() => undefined);
      }

      let inviteFailed = false;
      if (selectedFriendIds.length > 0) {
        try {
          await inviteMembers(
            trip.id,
            [...selectedFriendIds].sort((a, b) => a - b),
          );
        } catch {
          inviteFailed = true;
        }
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const openTrip = () => {
        createTripStore.reset();
        router.replace({ pathname: '/trip/[tripId]', params: { tripId: String(trip.id) } });
      };
      if (inviteFailed) {
        // Navigate from OK, like iOS posting `.tripCreated` from the alert's button, so the trip
        // screen doesn't land underneath a still-open alert.
        Alert.alert(
          t('Trip created with warnings'),
          t(
            "Trip was created, but we couldn't send all selected invites. You can invite friends from the trip details.",
          ),
          [{ text: t('OK'), onPress: openTrip }],
          { cancelable: false },
        );
      } else {
        openTrip();
      }
    } catch (err) {
      if (isWeb3UnavailableError(err)) {
        // Server says not eligible (e.g. network changed): drop the switch and let them retry.
        setWeb3(false);
        void queryClient.invalidateQueries({ queryKey: keys.web3Eligibility });
        setError(t('Group wallet is not available in your region. Create the trip without it.'));
        return;
      }
      setError(mutationErrorMessage(err, t('Failed to create trip')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <BackButton testID="new-trip-back" />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => void pickCover()} style={styles.coverWrap} testID="cover-picker">
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.coverImage} />
          ) : (
            <View style={styles.coverTile}>
              <View style={styles.coverPlaceholder}>
                <SFSymbol
                  name="photo.on.rectangle"
                  fallback="images-outline"
                  size={28}
                  frame={36}
                  color={colors.blueBase}
                />
              </View>
            </View>
          )}
        </Pressable>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('Trip name')}
          placeholderTextColor={colors.contentM}
          style={styles.nameInput}
          testID="trip-name-input"
        />

        <Pressable
          onPress={() => router.push('/trip/new/location')}
          style={styles.row}
          testID="location-row"
        >
          <SFSymbol
            name="mappin.and.ellipse"
            fallback="location-outline"
            size={16}
            frame={20}
            color={colors.blueBase}
          />
          <Text
            style={[styles.locationText, { color: location ? colors.contentB : colors.contentM }]}
            numberOfLines={1}
          >
            {location ? locationSelectionText(location) : t('Choose trip location')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => durationSheetRef.current?.present()}
          style={styles.row}
          testID="duration-row"
        >
          <SFSymbol
            name="calendar"
            fallback="calendar-outline"
            size={16}
            frame={20}
            color={colors.blueBase}
          />
          <Text style={styles.rowText}>{t('Duration')}</Text>
          <View style={styles.rowSpacer} />
          {durationText ? <Text style={styles.rowValue}>{durationText}</Text> : null}
          <Ionicons name="chevron-forward" size={14} color={colors.contentM} />
        </Pressable>

        {web3Enabled ? (
          <View style={styles.row} testID="group-wallet-row">
            <SFSymbol
              name="wallet.bifold"
              fallback="wallet-outline"
              size={16}
              frame={20}
              color={colors.blueBase}
            />
            <View style={styles.walletText}>
              <Text style={styles.rowText}>{t('Group wallet')}</Text>
              <Text style={styles.rowSubtitle}>
                {t('Pool money in USDC and approve spending together')}
              </Text>
            </View>
            <Switch
              value={web3}
              onValueChange={setWeb3}
              trackColor={{ true: colors.blueBase }}
              accessibilityLabel={t('Group wallet')}
              testID="group-wallet-toggle"
            />
          </View>
        ) : null}

        <View style={styles.friendsCard}>
          {friendRows.length === 0 ? (
            <View style={styles.emptyFriends} testID="new-trip-friends-empty">
              <svg.illustration.emptyFriend width={135} height={160} />
              <Text style={styles.emptyFriendsText}>{t('You don’t have any friend.')}</Text>
            </View>
          ) : (
            <>
              <Pressable
                onPress={() => router.push('/trip/new/friends')}
                style={styles.searchPill}
                accessibilityRole="button"
                testID="new-trip-friends-search"
              >
                <Ionicons name="search" size={16} color={colors.contentB} />
                <Text style={styles.searchText}>{t('Search')}</Text>
              </Pressable>
              <Text style={styles.friendCount}>
                {t('%lld friends', { count: friendRows.length })}
              </Text>
              <NewTripFriendRows friends={friendRows.slice(0, PREVIEW_FRIEND_COUNT)} />
            </>
          )}

          <Button
            title={submitting ? t('Creating...') : t('Create Trip')}
            disabled={createDisabled}
            onPress={() => void handleCreate()}
            style={[styles.createButton, createDisabled && styles.createButtonDisabled]}
            textStyle={createDisabled ? styles.createTextDisabled : undefined}
            testID="create-trip-submit"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>

      <TripDurationSheet ref={durationSheetRef} range={range} onConfirm={setRange} />
    </ScreenContainer>
  );
}

/** `CreateTripView.swift:82-84` — the cover tile's soft blue glow. */
const COVER_SHADOW = '0px 0px 12px rgba(51, 92, 255, 0.2)';

const styles = StyleSheet.create({
  header: { alignItems: 'flex-start', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  coverWrap: { alignSelf: 'center' },
  coverImage: { width: 80, height: 80, borderRadius: 20, boxShadow: COVER_SHADOW },
  coverTile: {
    width: 80,
    height: 80,
    padding: 4,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.15)',
    boxShadow: COVER_SHADOW,
  },
  coverPlaceholder: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.25)',
    borderStyle: 'dashed',
  },
  nameInput: {
    ...beVietnamPro(24),
    textAlign: 'center',
    color: colors.contentB,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  locationText: { ...beVietnamPro(14), flexShrink: 1 },
  rowText: { ...beVietnamPro(15), color: colors.contentB, flexShrink: 1 },
  rowSpacer: { flex: 1 },
  walletText: { flex: 1, gap: 2 },
  rowSubtitle: { ...beVietnamPro(13), color: colors.contentM },
  rowValue: { ...beVietnamPro(16), color: colors.contentB },
  friendsCard: {
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 24,
    gap: spacing.sm,
  },
  emptyFriends: { alignItems: 'center', gap: 14, paddingVertical: 12 },
  emptyFriendsText: {
    ...beVietnamPro(16, 'medium'),
    letterSpacing: -0.64,
    color: colors.contentM,
    textAlign: 'center',
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.neutral50,
  },
  searchText: { ...beVietnamPro(15), color: colors.neutral400 },
  friendCount: { ...beVietnamPro(14), color: colors.contentM, paddingHorizontal: spacing.lg },
  createButton: { marginHorizontal: spacing.lg },
  // iOS `PrimaryButton` disabled = gray glass + gray label, not a faded blue fill.
  createButtonDisabled: {
    opacity: 1,
    backgroundColor: colors.neutral50,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.08)',
  },
  createTextDisabled: { ...beVietnamPro(16), color: colors.neutral600 },
  error: {
    ...beVietnamPro(14),
    color: colors.warning500,
    paddingHorizontal: spacing.lg,
  },
});
