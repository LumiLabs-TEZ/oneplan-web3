/**
 * Port of `WelcomeTripWalletView.swift` (`origin/feat/web3-version`, Figma `4251:16033`/
 * `4251:15808`). First-login trip wallet welcome, presented as a root modal (see
 * `@/features/shell/rootModals.ts`).
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TripWalletWelcomeFriends from '@/assets/images/vault/tripWalletWelcomeFriends.svg';
import TripWalletWelcomeGlobe from '@/assets/images/vault/tripWalletWelcomeGlobe.svg';
import TripWalletWelcomeWallet from '@/assets/images/vault/tripWalletWelcomeWallet.svg';
import TripWalletWelcomeWalletSmall from '@/assets/images/vault/tripWalletWelcomeWalletSmall.svg';
import { useMe } from '@/features/me/useMe';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { shortenAddress } from '../shortenAddress';

import { useLinkWallet } from '../api/mutations';
import { ConnectWalletCard } from '../components/ConnectWalletCard';
import { VaultPalette } from '../components/VaultPalette';
import { markTripWalletWelcomeSeen } from '../tripWalletWelcomeStore';
import { describeUnknownError, WalletError, walletErrorMessageKey } from '../wallet/walletError';
import {
  connectedVaultWalletAddress,
  ensureVaultWallet,
  vaultWalletKind,
} from '../wallet/walletHandle';
import { withWalletTimeout } from '../wallet/walletTimeout';

const INK = '#363636';
const SUBTITLE_GRAY = '#999999';

export interface WelcomeTripWalletSheetProps {
  onContinue?: () => void;
  /** Opens Profile → wallet detail → deposit sheet, per iOS `onAddMoney`. */
  onAddMoney?: () => void;
}

export function WelcomeTripWalletSheet({ onContinue, onAddMoney }: WelcomeTripWalletSheetProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const me = useMe();
  const insets = useSafeAreaInsets();
  const linkWallet = useLinkWallet();

  // Android (MWA): the root provider publishes the handle long before this modal opens.
  const isMwa = vaultWalletKind() === 'mwa';
  const [address, setAddress] = useState<string | null>(() =>
    vaultWalletKind() === 'mwa' ? connectedVaultWalletAddress() : null,
  );
  const [setupError, setSetupError] = useState<unknown>(null);
  const [failed, setFailed] = useState(false);

  const isSettingUp = address === null;
  // On MWA connecting is optional here: the member can connect later from Profile → Wallet.
  const continueDisabled = isSettingUp && !isMwa;
  const setupErrorMessage = !failed
    ? null
    : setupError instanceof WalletError
      ? t(walletErrorMessageKey(setupError), { 0: setupError.reason })
      : describeUnknownError(setupError);
  const finish = onContinue ?? (() => router.back());

  const complete = (action: () => void) => {
    markTripWalletWelcomeSeen(me.data ? String(me.data.id) : null);
    action();
  };

  const setupWallet = async () => {
    setFailed(false);
    setSetupError(null);
    try {
      // Both steps are bounded — this screen must end in an address or an error, never a
      // spinner that outlives a dead Privy session or a stalled request. Not configured throws
      // `WalletError.notConfigured()` straight out of `ensureVaultWallet`.
      const publicKey = await ensureVaultWallet();
      await withWalletTimeout(linkWallet.mutateAsync({ publicKey }));
      setAddress(publicKey);
    } catch (error) {
      setSetupError(error);
      setFailed(true);
    }
  };

  // No close button: the sheet is swiped away via its grabber, which skips `complete`, so mark
  // it seen on unmount too (also covers a failed setup, where Continue stays disabled).
  const userId = me.data ? String(me.data.id) : null;
  useEffect(() => () => markTripWalletWelcomeSeen(userId), [userId]);

  useEffect(() => {
    // Android (MWA): never open the member's wallet app on mount — the Connect card is a tap.
    if (vaultWalletKind() === 'mwa') return;
    // One-time async setup on mount (Privy wallet linking), same as iOS's `.task` — not a
    // derived-state sync, so the cascading-render concern `set-state-in-effect` guards against
    // doesn't apply here. Deliberately `[]`: re-running on every `setupWallet` identity change
    // (it is recreated each render) would re-trigger setup in a loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void setupWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      style={[styles.root, { paddingBottom: insets.bottom + 16 }]}
      testID="welcome-trip-wallet-sheet"
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t('Welcome to your trip wallet')}</Text>
        <Text style={styles.subtitle}>
          {t('One place to hold trip money and split it with friends')}
        </Text>
      </View>

      {isMwa && address === null ? (
        // Handles cancel / no wallet app / 409 itself; its connect already linked the key
        // server-side (SIWS), so no `/wallet/link` call here.
        <View style={styles.connectCard}>
          <ConnectWalletCard onConnected={setAddress} />
        </View>
      ) : (
        <View style={styles.statusCard}>
          {address ? (
            <>
              <TripWalletWelcomeWallet width={28} height={28} />
              <Text
                style={styles.statusAddress}
                numberOfLines={1}
                testID="welcome-trip-wallet-address"
              >
                {shortenAddress(address, 8)}
              </Text>
              <Pressable
                onPress={() => complete(() => (onAddMoney ?? finish)())}
                style={styles.addMoneyPill}
                accessibilityRole="button"
                testID="welcome-trip-wallet-add-money"
              >
                <Text style={styles.addMoneyText}>{t('Add money to get start')}</Text>
              </Pressable>
            </>
          ) : setupErrorMessage !== null ? (
            <>
              <TripWalletWelcomeWallet width={28} height={28} />
              <Text style={styles.statusTitle}>{t('Could not set up wallet')}</Text>
              <Text style={styles.statusError} numberOfLines={3} testID="welcome-trip-wallet-error">
                {setupErrorMessage}
              </Text>
              <Pressable
                onPress={() => void setupWallet()}
                style={styles.addMoneyPill}
                accessibilityRole="button"
                testID="welcome-trip-wallet-retry"
              >
                <Text style={styles.addMoneyText}>{t('Retry')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TripWalletWelcomeWallet width={28} height={28} />
              <Text style={styles.statusTitle}>{t('Setting up your wallet')}</Text>
              <Text style={styles.statusSubtitle}>{t('Few seconds')}</Text>
            </>
          )}
        </View>
      )}

      <View style={styles.fundingOptions}>
        <OptionRow
          icon={<TripWalletWelcomeGlobe width={28} height={28} />}
          title={t('Bank transfer')}
          subtitle={t('Add USD, EUR or VND from your bank')}
        />
        <OptionRow
          icon={<TripWalletWelcomeWalletSmall width={28} height={28} />}
          title={t('From a crypto wallet')}
          subtitle={t('Send USDC from any Solana wallet')}
        />
        <OptionRow
          icon={<TripWalletWelcomeFriends width={28} height={28} />}
          title={t('From a friend')}
          subtitle={t('Get money sent by another OnePlan user')}
        />
      </View>

      <View style={styles.footer}>
        <View style={styles.disclosureBlock}>
          <TripWalletWelcomeWalletSmall width={28} height={28} />
          <Text style={styles.disclosureText}>
            {isMwa
              ? t(
                  "Your own Solana wallet app holds your keys and signs every payment. OnePlan never holds your keys. Trip money sits in the group's on-chain vault, and spending above the trip's limit needs a second member to approve it too. OnePlan covers the network fees, so you never need to hold SOL. ",
                )
              : t(
                  "Setting up a wallet creates a Solana account tied to your OnePlan sign-in, through our wallet provider. Payments need your approval, and spending from a trip fund above the trip's limit needs a second member to approve it too. OnePlan covers the network fees, so you never need to hold SOL. ",
                )}
            <Text
              style={styles.disclosureLink}
              onPress={() => router.push('/how-money-is-held')}
              testID="welcome-trip-wallet-how-held"
            >
              {t('See how your money is held')}
            </Text>
          </Text>
        </View>

        <Pressable
          onPress={() => complete(finish)}
          disabled={continueDisabled}
          style={[styles.continueButton, continueDisabled && styles.continueButtonDisabled]}
          accessibilityRole="button"
          testID="welcome-trip-wallet-continue"
        >
          <Text style={styles.continueText}>{t('Continue')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function OptionRow({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.optionRow}>
      <View style={styles.optionIcon}>{icon}</View>
      <View style={styles.optionText}>
        <Text style={styles.optionTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Top padding clears the native grabber.
  root: { flex: 1, backgroundColor: colors.surface, paddingTop: 44 },
  header: { paddingHorizontal: 24, gap: 3, marginBottom: 20 },
  title: { ...beVietnamPro(28), letterSpacing: -1.96, color: INK },
  subtitle: { ...beVietnamPro(15), letterSpacing: -0.75, color: SUBTITLE_GRAY },
  statusCard: {
    marginHorizontal: 20,
    height: 150,
    borderRadius: 24,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  connectCard: { marginHorizontal: 20, marginBottom: 20 },
  statusAddress: { ...beVietnamPro(18), letterSpacing: -0.54, color: INK, maxWidth: '80%' },
  statusTitle: { ...beVietnamPro(18), letterSpacing: -0.54, color: INK },
  statusError: {
    ...beVietnamPro(14),
    color: 'rgba(54, 54, 54, 0.6)',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  statusSubtitle: { ...beVietnamPro(14), color: 'rgba(54, 54, 54, 0.4)' },
  addMoneyPill: {
    backgroundColor: INK,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addMoneyText: { ...beVietnamPro(14), letterSpacing: -0.28, color: colors.white },
  fundingOptions: { paddingHorizontal: 20, gap: 20 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { ...beVietnamPro(18), letterSpacing: -0.54, color: colors.neutral950 },
  optionSubtitle: {
    ...beVietnamPro(15),
    letterSpacing: -0.45,
    color: 'rgba(54, 54, 54, 0.4)',
  },
  // Pinned to the bottom of the sheet.
  footer: { paddingHorizontal: 16, gap: 24, marginTop: 'auto', paddingTop: 16 },
  disclosureBlock: { gap: 2 },
  disclosureText: { ...beVietnamPro(12), letterSpacing: -0.36, color: SUBTITLE_GRAY },
  disclosureLink: { color: VaultPalette.accent },
  continueButton: {
    height: 52,
    borderRadius: 999,
    backgroundColor: VaultPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.12)',
  },
  continueButtonDisabled: { opacity: 0.5 },
  continueText: { ...beVietnamPro(17, 'regular'), letterSpacing: -0.68, color: colors.white },
});
