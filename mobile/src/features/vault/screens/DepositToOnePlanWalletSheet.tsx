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

import { useAppLanguage } from '@/i18n';
import { Spinner } from '@/ui/components/Spinner';
import { StyledQRCode } from '@/ui/components/StyledQRCode';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useWallet } from '../api/queries';
import { ConnectWalletCard } from '../components/ConnectWalletCard';
import { VaultPalette } from '../components/VaultPalette';
import { isVaultWalletConfigured, vaultWalletKind } from '../wallet/walletHandle';
import { ensureWalletLinked } from '../wallet/authBootstrap';

/** Fits the 0.8-detent sheet with the header, address, note and button on a 6.1" phone. */
const QR_SIZE = 270;

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
    <View style={styles.root} testID="wallet-deposit-sheet">
      <View style={styles.header}>
        <Text style={styles.title}>
          {mode === 'receive' ? t('Receive to ') : t('Deposit to ')}
          <Text style={styles.titleAccent}>{t('OnePlan Wallet')}</Text>
        </Text>
        <Text style={styles.subtitle}>
          {mode === 'receive'
            ? t('Receive USDC on Solana to your OnePlan Wallet')
            : t('From your personal Solana wallet')}
        </Text>
      </View>

      <View style={[styles.body, isLoading && styles.bodyLoading]}>
        {isLoading ? (
          <Spinner fill />
        ) : address ? (
          <>
            <StyledQRCode value={address} size={QR_SIZE} color={colors.black} />
            <Pressable
              onPress={() => copyAddress(address)}
              testID="wallet-deposit-copy"
              accessibilityLabel={copied ? t('Address copied') : t('Copy wallet address')}
            >
              <AddressText address={address} />
            </Pressable>
            <View style={styles.chainNote}>
              <Text style={styles.chainNoteText}>{t('Send only USDC on the Solana network')}</Text>
            </View>
          </>
        ) : vaultWalletKind() === 'mwa' ? (
          // Android: `ensureWalletLinked()` is a no-op for MWA, so an unlinked member connects here.
          <ConnectWalletCard onConnected={() => void wallet.refetch()} />
        ) : null}
      </View>

      <Pressable
        onPress={back}
        style={styles.goBackButton}
        accessibilityRole="button"
        testID="wallet-deposit-go-back"
      >
        <Text style={styles.goBackText}>{t('Go back')}</Text>
      </Pressable>

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
  // Sized to its content (`fitToContents` detent) — no flex, so the button sits under the note.
  // Top padding clears the grabber; iOS already adds the bottom inset under fitToContents.
  root: {
    backgroundColor: colors.surface,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 8,
  },
  header: { alignItems: 'center', gap: 4 },
  title: {
    ...beVietnamPro(22),
    letterSpacing: -0.88,
    color: colors.neutral950,
    textAlign: 'center',
  },
  titleAccent: { ...beVietnamPro(22), color: VaultPalette.accent, fontStyle: 'italic' },
  subtitle: {
    ...beVietnamPro(15),
    letterSpacing: -0.45,
    color: colors.contentM,
    textAlign: 'center',
  },
  body: { alignItems: 'center', gap: 10, paddingTop: 20, paddingBottom: 24 },
  bodyLoading: { height: QR_SIZE + 120 },
  chainNote: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.neutral100,
  },
  chainNoteText: { ...beVietnamPro(13), letterSpacing: -0.26, color: colors.contentM },
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
