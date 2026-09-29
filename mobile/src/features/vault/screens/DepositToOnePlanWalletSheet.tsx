/**
 * Port of `DepositToOnePlanWalletView.swift` (`origin/feat/web3-version`). Funds / receives to
 * the member's personal OnePlan Wallet via Solana USDC — highest fan-in sheet in the whole
 * surface (6 iOS entry points across waves A/C/D), so it is built once here as a shared route
 * rather than re-derived per wave (`docs/web3/rn-ui-parity-inventory.md` `deposit-to-oneplan-wallet`
 * row).
 *
 * Presented as a `formSheet` route (`src/app/wallet/deposit.tsx`, `sheetAllowedDetents: [0.8]`,
 * `sheetCornerRadius: 48`) matching Swift's `.presentationDetents([.fraction(0.8)])
 * .presentationCornerRadius(48)` at its ContributeToVaultView call site — the visual result reads
 * the same as iOS's stacked `.sheet` even though it is technically a pushed route rather than
 * literally nested over the caller (`router.back()` returns the same way dismissing the iOS sheet
 * does).
 */
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppLanguage } from '@/i18n';
import { Spinner } from '@/ui/components/Spinner';
import { StyledQRCode } from '@/ui/components/StyledQRCode';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useWallet } from '../api/queries';
import { VaultPalette } from '../components/VaultPalette';
import { isVaultWalletConfigured } from '../wallet/walletHandle';
import { ensureWalletLinked } from '../wallet/authBootstrap';

export type DepositToOnePlanWalletMode = 'deposit' | 'receive';

export interface DepositToOnePlanWalletSheetProps {
  mode?: DepositToOnePlanWalletMode;
  onBack?: () => void;
}

export function DepositToOnePlanWalletSheet({
  mode = 'deposit',
  onBack,
}: DepositToOnePlanWalletSheetProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const back = onBack ?? (() => router.back());

  const [linking, setLinking] = useState(true);
  const wallet = useWallet({ enabled: !linking });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Post-login bootstrap may still be in flight — link here if needed, same as iOS's `load()`.
      if (isVaultWalletConfigured()) await ensureWalletLinked();
      if (!cancelled) setLinking(false);
    })().catch(() => {
      if (!cancelled) setLinking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = linking || wallet.isLoading;
  const address = wallet.data?.publicKey ?? null;

  const copyAddress = (value: string) => {
    void Clipboard.setStringAsync(value);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 31 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {mode === 'receive' ? t('Receive to ') : t('Deposit to ')}
          <Text style={styles.titleAccent}>{t('OnePlan Wallet')}</Text>
        </Text>
        <Text style={styles.subtitle}>
          {mode === 'receive'
            ? t('Receive USDC on Solana to your OnePlan Wallet')
            : t('Deposit to OnePlan Wallet\nfrom your personal Solana wallet')}
        </Text>
      </View>

      {isLoading ? (
        <Spinner fill />
      ) : address ? (
        <>
          <View style={styles.body}>
            <Text style={styles.chainWarning}>
              {mode === 'receive' ? t('Make sure to send USDC\nvia ') : t('Make sure to deposit USDC\nvia ')}
              <Text style={styles.chainWarningAccent}>{t('Solana')}</Text>
              {t(' chain only.')}
            </Text>

            <View style={styles.qrCard}>
              <StyledQRCode value={address} size={283} color={colors.black} />
              <Pressable
                onPress={() => copyAddress(address)}
                accessibilityLabel={copied ? t('Address copied') : t('Copy wallet address')}
              >
                <AddressText address={address} />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={back}
            style={styles.goBackButton}
            accessibilityRole="button"
          >
            <Text style={styles.goBackText}>{t('Go back')}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={back} style={styles.goBackButton} accessibilityRole="button">
          <Text style={styles.goBackText}>{t('Go back')}</Text>
        </Pressable>
      )}

      {copied ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{t('Copied successfully')}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Highlights the leading/trailing characters — how people actually check an address. */
function AddressText({ address }: { address: string }) {
  const highlight = 6;
  if (address.length <= highlight * 2) {
    return <Text style={styles.addressText}>{address}</Text>;
  }
  const head = address.slice(0, highlight);
  const tail = address.slice(-highlight);
  const middle = address.slice(highlight, -highlight);
  return (
    <Text style={styles.addressText} numberOfLines={2}>
      {head}
      <Text style={styles.addressMiddle}>{middle}</Text>
      {tail}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 24 },
  header: { alignItems: 'center', gap: 3, marginBottom: 20 },
  title: { ...beVietnamPro(20), letterSpacing: -0.8, color: colors.neutral950, textAlign: 'center' },
  titleAccent: { ...beVietnamPro(20), color: VaultPalette.accent, fontStyle: 'italic' },
  subtitle: {
    ...beVietnamPro(14),
    letterSpacing: -0.42,
    color: colors.contentM,
    textAlign: 'center',
  },
  body: { flex: 1, gap: 16, justifyContent: 'center' },
  chainWarning: { ...beVietnamPro(16), color: colors.contentM, textAlign: 'center' },
  chainWarningAccent: { ...beVietnamPro(16), color: colors.black, fontStyle: 'italic' },
  qrCard: {
    padding: 24,
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.surface,
    borderRadius: 30,
    boxShadow: '0px 4px 6.3px rgba(0, 0, 0, 0.12)',
  },
  addressText: { ...beVietnamPro(16), color: '#3D3D3D', textAlign: 'center', maxWidth: 250 },
  addressMiddle: { ...beVietnamPro(16), color: colors.blueBase },
  goBackButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBackText: { ...beVietnamPro(17, 'regular'), letterSpacing: -0.68, color: colors.white },
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(84, 84, 84, 0.92)',
  },
  toastText: { ...beVietnamPro(15), letterSpacing: -0.3, color: colors.white },
});
