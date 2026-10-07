/**
 * Profile screen — port of `View/Profile/ProfileView.swift`: avatar upload, info card, passport
 * preview panel, community-profile stub, friends section. Passport summary requests the
 * all-time card (`year: null`) — per-year browsing lives on the dedicated Passport screen.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mutationErrorMessage } from '@/api/mutationError';
import { useFriendRequests, useFriends } from '@/features/friends/api/queries';
import { useUploadAvatar } from '@/features/me/api/mutations';
import { useIsPro, useMe } from '@/features/me/useMe';
import { usePassportSummary } from '@/features/passport/api/queries';
import { PassportCard } from '@/features/passport/components';
import {
  CommunityProfileRow,
  ProfileAvatar,
  ProfileFriendsSection,
  ProfileInfoCard,
} from '@/features/profile/components';
import { useWallet } from '@/features/vault/api/queries';
import { OnePlanWalletCard } from '@/features/vault/components/OnePlanWalletCard';
import {
  WalletWithdrawSheetHost,
  type WalletWithdrawSheetHostRef,
} from '@/features/vault/screens/WalletWithdrawSheetHost';
import { useWeb3Enabled } from '@/features/vault/web3Flag';
import { useAppLanguage } from '@/i18n';
import { pickImages } from '@/native/imagePick';
import { requireOnline } from '@/offline/guardOnline';
import { useServingCached } from '@/offline/servingCached';
import { GlassIconButton, OfflineBanner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

// How much of the compact card's bottom the panel clips: the card's 24pt bottom padding plus
// most of the trips count's descender space (Be Vietnam Pro descent 0.265em ≈ 11pt at 41pt),
// leaving the baseline ~5pt inside the clip. Clipping a fixed amount (instead of fixing the
// panel height) lets the panel grow with Android's taller text so the count stays visible.
const PASSPORT_CARD_CLIP = 30;
/** `GlassIconButton` diameter — the floating header's row height. */
const HEADER_ROW = 45;

export default function ProfileScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const isPro = useIsPro();
  const passport = usePassportSummary(null);
  const friends = useFriends();
  const requests = useFriendRequests();
  const uploadAvatar = useUploadAvatar(me.data?.id ?? 0);
  const servingCachedMe = useServingCached(me);
  const web3Enabled = useWeb3Enabled();
  const wallet = useWallet({ enabled: web3Enabled });
  const withdrawSheetRef = useRef<WalletWithdrawSheetHostRef>(null);
  const balanceMicro = wallet.data ? BigInt(wallet.data.balanceMicro) : 0n;
  const balanceUsdc = Number(balanceMicro) / 1_000_000;
  // Indicative only — same ballpark as the trip vault UX until live FX is wired.
  const balanceVnd = balanceUsdc * 26_500;

  const pickAvatar = async () => {
    if (!me.data) return;
    if (!requireOnline(t)) return;
    const [uri] = await pickImages(1);
    if (!uri) return;
    try {
      await uploadAvatar.mutateAsync(uri);
    } catch (err) {
      Alert.alert(t('Something went wrong'), mutationErrorMessage(err, t('Something went wrong')));
    }
  };

  return (
    <View style={styles.root} testID="profile-screen">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 6 + HEADER_ROW + spacing.sm + spacing.md },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {servingCachedMe ? <OfflineBanner cachedAt={me.dataUpdatedAt} /> : null}

        <ProfileAvatar
          uri={me.data?.avatarUrl}
          uploading={uploadAvatar.isPending}
          isPro={isPro}
          onPick={pickAvatar}
        />

        {web3Enabled ? (
          <OnePlanWalletCard
            address={wallet.data?.publicKey ?? null}
            balanceUsdc={balanceUsdc}
            balanceVnd={balanceVnd}
            isLoading={wallet.isLoading}
            onOpenDetail={() => router.push('/profile/wallet')}
            onWithdraw={() => withdrawSheetRef.current?.present()}
            onDeposit={() => router.push('/wallet/deposit')}
            testID="profile-wallet-card"
          />
        ) : null}

        <ProfileInfoCard
          profile={me.data}
          isPro={isPro}
          onQrPress={() => router.push('/profile/invite')}
          onGetPro={() => router.push('/paywall')}
          testID="profile-info-card"
        />

        <Pressable
          accessibilityRole="button"
          testID="profile-passport"
          onPress={() => router.push('/profile/passport')}
          style={styles.passportCard}
        >
          <Text style={styles.passportTitle}>{t('Passport')}</Text>
          <View style={styles.passportPanel}>
            <LinearGradient colors={['#E8F2FD', '#78BAFF']} style={StyleSheet.absoluteFill} />
            <View pointerEvents="none" style={styles.passportContent}>
              <PassportCard summary={passport.data ?? null} variant="compact" />
            </View>
          </View>
        </Pressable>

        <CommunityProfileRow />

        <ProfileFriendsSection
          requests={requests.data ?? []}
          friends={friends.data ?? []}
          onOpenList={() => router.push('/profile/friends')}
          testID="profile-friends"
        />
      </ScrollView>
      {/* Floats over the scroll content (like iOS's toolbar glass buttons) instead of sitting
          in a band that clips it; rendered after the ScrollView so it stays on top. */}
      <View pointerEvents="box-none" style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <BackButton testID="profile-back" />
        <View style={styles.headerActions}>
          <GlassIconButton
            label={t('Settings')}
            icon="settings"
            testID="profile-settings"
            onPress={() => router.push('/profile/settings')}
          />
          <GlassIconButton
            label={t('Invite')}
            testID="profile-invite"
            onPress={() => router.push('/profile/invite')}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={18} color={colors.contentB} />
          </GlassIconButton>
        </View>
      </View>

      {web3Enabled ? <WalletWithdrawSheetHost ref={withdrawSheetRef} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
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
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxxl },
  passportCard: {
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 24,
    gap: spacing.sm,
  },
  passportTitle: {
    ...beVietnamPro(14),
    letterSpacing: -0.7,
    color: colors.contentB,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: 2,
  },
  passportPanel: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  // Swift pads 48pt, but its ZStack centers the overflowing card, so the card actually sits
  // ~16pt below the panel top with the trips count just inside the clip.
  passportContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    marginBottom: -PASSPORT_CARD_CLIP,
  },
});
