/**
 * Full-screen VietQR scanner for paying a merchant from the trip vault — port of
 * `ios/OnePlan/OnePlan/View/Vault/VaultScanQRView.swift` (`feat/web3-version`).
 *
 * The payload is decoded on device by `decodeVietQr` (`../solana/vietqr.ts`) before anything is
 * sent, so a code that is not a Vietnamese bank transfer never leaves the phone. The photo-picker
 * fallback exists because the iOS Simulator (and this screen's Android/iOS test doubles) have no
 * camera — it is also the only way to exercise this screen without a physical device.
 *
 * Props-in: no data fetching, no service calls. The caller supplies `onScanned` (decoded payload +
 * raw string, so a repeat payment can resend the original code) and `onCancel`.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { pickQrFromPhoto, QRScanner } from '@/native/camera/QRScanner';
import { VaultHeaderChip } from '@/features/vault/components';
import { useAppLanguage } from '@/i18n';
import { SFSymbol } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { decodeVietQr, type VietQrPayload } from '../solana/vietqr';

/** 174.65pt square in the Figma node. */
const FRAME_SIZE = 175;
const REJECT_MESSAGE_MS = 2000;

export interface VaultScanQRScreenProps {
  onScanned: (payload: VietQrPayload, rawPayload: string) => void;
  onCancel: () => void;
}

export function VaultScanQRScreen({ onScanned, onCancel }: VaultScanQRScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const [rejectedMessage, setRejectedMessage] = useState<string | null>(null);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(true);

  useEffect(
    () => () => {
      if (rejectTimer.current) clearTimeout(rejectTimer.current);
    },
    [],
  );

  const reject = (message: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    if (rejectTimer.current) clearTimeout(rejectTimer.current);
    setRejectedMessage(message);
    rejectTimer.current = setTimeout(() => setRejectedMessage(null), REJECT_MESSAGE_MS);
  };

  const handleRaw = (raw: string) => {
    try {
      const decoded = decodeVietQr(raw.trim());
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      // Stop scanning before handing off — mirrors Swift's `scanner.stopSession()`.
      setActive(false);
      onScanned(decoded, raw);
    } catch {
      // Keep scanning: the user is most likely pointing at a non-payment code, and closing the
      // camera would make them start over.
      reject(t('That is not a Vietnamese payment code'));
    }
  };

  const handlePickPhoto = async () => {
    const result = await pickQrFromPhoto();
    if (result.kind === 'cancelled') return;
    if (result.kind === 'noCode') {
      reject(t('No QR code in that image'));
      return;
    }
    handleRaw(result.value);
  };

  return (
    <View style={styles.root} testID="vault-scan-qr-screen">
      {active ? <QRScanner active onCode={handleRaw} style={StyleSheet.absoluteFill} /> : null}

      <View pointerEvents="none" style={styles.frameWrap}>
        <View style={styles.frame} />
      </View>

      <View style={styles.overlay}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Back')}
            onPress={onCancel}
            testID="vault-scan-qr-back-icon"
          >
            <VaultHeaderChip overCamera>
              <View style={styles.backIcon}>
                <SFSymbol name="arrow.left" fallback="arrow-back" size={14} color={colors.white} />
              </View>
            </VaultHeaderChip>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            testID="vault-scan-qr-back-label"
          >
            <VaultHeaderChip overCamera>
              <Text style={styles.backLabel}>{t('Back')}</Text>
            </VaultHeaderChip>
          </Pressable>

          <View style={styles.spacer} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Choose a code from your photos')}
            onPress={() => void handlePickPhoto()}
            testID="vault-scan-qr-photo-picker"
          >
            <VaultHeaderChip overCamera cornerRadius={18}>
              <View style={styles.photoIcon}>
                <SFSymbol
                  name="photo.on.rectangle"
                  fallback="images-outline"
                  size={15}
                  color={colors.white}
                />
              </View>
            </VaultHeaderChip>
          </Pressable>
        </View>

        <View style={styles.bottom}>
          {rejectedMessage ? (
            <View style={styles.rejectedPill} testID="vault-scan-qr-rejected">
              <Text style={styles.rejectedText}>{rejectedMessage}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'black' },
  frameWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.blueBase,
  },
  overlay: { flex: 1, justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingTop: 8 },
  backIcon: { width: 32, height: 32, textAlign: 'center', textAlignVertical: 'center' },
  backLabel: {
    ...beVietnamPro(15),
    letterSpacing: -0.3,
    color: colors.white,
    width: 61,
    height: 34,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  spacer: { flex: 1 },
  photoIcon: { width: 36, height: 36, textAlign: 'center', textAlignVertical: 'center' },
  bottom: { alignItems: 'center', paddingBottom: 48 },
  rejectedPill: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rejectedText: { ...beVietnamPro(14), color: colors.white },
});
