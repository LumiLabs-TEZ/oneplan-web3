/**
 * Invite screen — port of `View/Trip/TripInviteView.swift`. Shows the QR / share card for the
 * trip's invite code plus the friends section (`TripInviteFriends`); offline or code-less trips
 * fall back to the shared offline empty state.
 */
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyOffline } from '@/features/home/components';
import { TripInviteCard, TripInviteFriends } from '@/features/invite/components';
import { useTripCore } from '@/features/trip/TripDetailContext';
import { useAppLanguage } from '@/i18n';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export default function TripInviteScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { tripId, trip, members, access } = useTripCore();
  const inviteCode = trip?.inviteCode;
  const unavailable = access.isOffline || !inviteCode;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <BackButton />
        <Text style={styles.title} numberOfLines={1}>
          {t('Invite')}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {unavailable ? (
          <EmptyOffline style={styles.empty} />
        ) : (
          <>
            <TripInviteCard
              tripName={trip?.name ?? ''}
              coverImageUrl={trip?.coverImageUrl}
              inviteCode={inviteCode}
            />
            <TripInviteFriends tripId={tripId} members={members} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...beVietnamPro(17, 'medium'), color: colors.contentB, flex: 1, textAlign: 'center' },
  content: { padding: spacing.lg, gap: spacing.md },
  empty: { marginTop: spacing.xxxl * 2 },
});
