/**
 * QR-only camera scanner. Port of `QRScannerManager` (CameraKit.swift:202-260): requests camera
 * permission once, dedupes repeat deliveries of the same value within `cooldownMs`, and only
 * scans while `active` — the caller decides when the camera should actually be listening
 * (screen focused + reveal panel open).
 *
 * API verified against `node_modules/expo-camera/build/index.d.ts` (`useCameraPermissions`) and
 * `node_modules/expo-camera/build/CameraView.d.ts` (`CameraViewProps.onBarcodeScanned`,
 * `barcodeScannerSettings`, `BarcodeScanningResult`). Note: the jest mock in `jest.setup.ts`
 * returns a 2-tuple `[permission, requestPermission]`, not the real 3-tuple — only those two are
 * destructured here so the mock and the real hook both work.
 */
import {
  CameraView,
  scanFromURLAsync,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface QRScannerProps {
  /**
   * Gates everything: while `false`, the camera is never mounted and permission is never
   * requested — not just "not listening". A denied/pending permission never renders the
   * "unavailable" card unless a request was actually attempted (i.e. the panel was activated at
   * least once).
   */
  active: boolean;
  onCode: (raw: string) => void;
  /** Minimum gap between two deliveries of the same scanned value. */
  cooldownMs?: number;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_COOLDOWN_MS = 1000;

export function QRScanner({ active, onCode, cooldownMs = DEFAULT_COOLDOWN_MS, style }: QRScannerProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  // State, not a ref: the fallback card must re-render once a request has actually been made
  // (a ref write alone wouldn't re-render this component even though it changes what should show).
  const [hasRequested, setHasRequested] = useState(false);
  const lastCodeRef = useRef<string | null>(null);
  const lastDeliveredAtRef = useRef(0);

  useEffect(() => {
    if (!active || permission?.granted || hasRequested) return;
    let cancelled = false;
    // `setHasRequested` runs in the resolution callback, not synchronously in the effect body —
    // this is the "subscribe to an external system, setState when it reports back" shape the
    // set-state-in-effect rule allows, and it means the fallback card only flips to "unavailable"
    // once the request has actually resolved (no premature flash while it's still pending).
    void requestPermission().then(() => {
      if (!cancelled) setHasRequested(true);
    });
    return () => {
      cancelled = true;
    };
  }, [active, permission, hasRequested, requestPermission]);

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const value = result.data;
      if (!value) return;
      const now = Date.now();
      if (value === lastCodeRef.current && now - lastDeliveredAtRef.current < cooldownMs) return;
      lastCodeRef.current = value;
      lastDeliveredAtRef.current = now;
      onCode(value);
    },
    [cooldownMs, onCode],
  );

  if (active && permission?.granted) {
    return (
      <CameraView
        testID="qr-scanner"
        style={[styles.camera, style]}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcodeScanned}
      />
    );
  }

  // Only shown once a request was actually made and denied — inactive, or active-but-not-yet-
  // requested, renders a plain empty frame instead of implying the user was asked and said no.
  if (active && hasRequested && !permission?.granted) {
    return (
      <View style={[styles.fallback, style]} testID="qr-scanner-unavailable">
        <Text style={styles.fallbackText}>{t('Camera preview is unavailable.')}</Text>
      </View>
    );
  }

  return <View style={[styles.fallback, style]} testID="qr-scanner-placeholder" />;
}

export type PickQrFromPhotoResult =
  | { kind: 'scanned'; value: string }
  | { kind: 'cancelled' }
  /** A photo was picked, but it decoded to zero or more-than-one QR code, or failed to read at all. */
  | { kind: 'noCode' };

/**
 * Photo-library fallback for a QR code — the only way to exercise the scanner in a simulator,
 * which has no camera (port of `VaultScanQRView.readCode(from:)`, `feat/web3-version`). Takes the
 * first code found in an ambiguous multi-code image rather than guessing which one was meant.
 */
export async function pickQrFromPhoto(): Promise<PickQrFromPhotoResult> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
  if (!uri) return { kind: 'cancelled' };

  const codes = await scanFromURLAsync(uri, ['qr']).catch(() => []);
  const value = codes[0]?.data;
  return value ? { kind: 'scanned', value } : { kind: 'noCode' };
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.onSurface,
    paddingHorizontal: 16,
  },
  fallbackText: {
    ...beVietnamPro(14),
    color: colors.contentM,
    textAlign: 'center',
  },
});
