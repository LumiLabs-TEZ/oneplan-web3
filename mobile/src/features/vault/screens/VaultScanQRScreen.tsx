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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickQrFromPhoto, QRScanner } from '@/native/camera/QRScanner';
import { VaultPalette } from '@/features/vault/components';
import { useAppLanguage } from '@/i18n';
import { BackPillButton, GlassSurface, SFSymbol } from '@/ui/components';
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
  // Full-screen modal over the camera: the header must clear the status bar itself, or its
  // buttons sit under it and stop receiving taps.
  const insets = useSafeAreaInsets();
  const [rejectedMessage, setRejectedMessage] = useState<string | null>(null);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(true);
  // Swift's `scanner.isAuthorized`: false until permission is granted, so the hint also shows
  // while the prompt is still up.
  const [authorized, setAuthorized] = useState(false);

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
      {active ? (
        <QRScanner
          active
          onCode={handleRaw}
          onAuthorizedChange={setAuthorized}
          hideUnavailableMessage
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <View pointerEvents="none" style={styles.frameWrap}>
        <View style={styles.frame}>
          {authorized ? null : (
            <View style={styles.permissionHint} testID="vault-scan-qr-permission-hint">
              <SFSymbol
                name="camera.fill"
                fallback="camera"
                size={26}
                color="rgba(255, 255, 255, 0.7)"
              />
              <Text style={styles.permissionText}>
                {t('Allow camera access, or pick a code from your photos')}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.overlay}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          {/* Same header controls as the web2 keypad screens (add expense / add budget). */}
          <BackPillButton onPress={onCancel} testID="vault-scan-qr-back" />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Choose a code from your photos')}
            onPress={() => void handlePickPhoto()}
            hitSlop={6}
            style={styles.photoShadow}
            testID="vault-scan-qr-photo-picker"
          >
            <GlassSurface preset="control" radius={16} style={styles.photoIcon}>
              <SFSymbol
                name="photo.on.rectangle"
                fallback="images-outline"
                size={16}
                frame={20}
                color={colors.neutral900}
              />
            </GlassSurface>
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
    borderCurve: 'continuous',
    borderWidth: 3,
    borderColor: VaultPalette.scanFrame,
    // Swift: `.shadow(color: VaultPalette.scanFrame.opacity(0.5), radius: 12)`.
    boxShadow: '0px 0px 12px rgba(255, 183, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionHint: { alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  permissionText: {
    ...beVietnamPro(13),
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  overlay: { flex: 1, justifyContent: 'space-between' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  // Matches `BackPillButton`'s circle: 32pt glass with the same soft drop shadow.
  photoShadow: { borderRadius: 16, boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)' },
  photoIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  bottom: { alignItems: 'center', paddingBottom: 48 },
  rejectedPill: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rejectedText: { ...beVietnamPro(14), color: colors.white },
});
