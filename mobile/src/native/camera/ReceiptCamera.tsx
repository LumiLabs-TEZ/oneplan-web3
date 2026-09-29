import { ReceiptIcon } from '@/features/receipt/components/ReceiptIcon';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useAppLanguage } from '@/i18n';
import { rasterIllustration } from '@/ui/components/RasterIllustration';
import { colors } from '@/ui/theme';
import type { ReceiptPhoto } from './receiptImage';

// Receipt-printer art, rendered from the Figma SVG (base64 PNG + text paths) to WebP.
const Placeholder = rasterIllustration(
  require('@/assets/images/receipt/receiptPlaceholder.webp') as number,
  { width: 417, height: 500 },
);

export function ReceiptCamera({
  active,
  onPhoto,
  onError,
  canCapture,
}: {
  active: boolean;
  onPhoto: (photo: ReceiptPhoto) => void;
  onError: (message: string) => void;
  canCapture: () => boolean;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lensWidth, setLensWidth] = useState(0);
  const placeholderWidth = Math.min(lensWidth * 0.72, 268.84);
  const live = active && foreground && !!permission?.granted && Device.isDevice;
  const locked = useRef(false);
  const mounted = useRef(true);
  const requested = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    void requestPermission().catch(() => onError(t('Camera preview is unavailable.')));
  }, [active, requestPermission, onError, t]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      setReady(false);
      if (state === 'active') void getPermission?.();
    });
    return () => subscription.remove();
  }, [getPermission]);
  const capture = async (library: boolean) => {
    if (locked.current || !active) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!canCapture()) return;
    locked.current = true;
    setBusy(true);
    try {
      let photo: ReceiptPhoto | undefined;
      if (library) {
        // System picker grants access to the selected image; no broad library permission needed.
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
        });
        if (!result.canceled) photo = result.assets[0];
      } else if (!permission?.granted) {
        const result = permission?.canAskAgain ? await requestPermission() : permission;
        if (!result?.granted) await Linking.openSettings();
      } else if (ready) photo = await camera.current?.takePictureAsync({ quality: 1 });
      if (mounted.current && photo) onPhoto(photo);
    } catch {
      if (mounted.current) onError(t('Failed to process image.'));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <View style={styles.container}>
      <View
        style={styles.lens}
        testID="receipt-lens"
        onLayout={(event) => setLensWidth(event.nativeEvent.layout.width)}
      >
        {live ? (
          <CameraView
            testID="receipt-camera"
            key={facing}
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mirror={facing === 'front'}
            mode="picture"
            onCameraReady={() => setReady(true)}
            onMountError={() => {
              setReady(false);
              onError(t('Camera preview is unavailable.'));
            }}
          />
        ) : null}
        {/* Receipt-printer art until a frame is live — covers warm-up and the simulator, which
            has no camera (`ScanBillView.swift` shows it whenever there is no session). */}
        {!live || !ready ? (
          <View style={styles.placeholder} pointerEvents="none" testID="receipt-placeholder">
            <Placeholder width={placeholderWidth} height={(placeholderWidth * 500) / 417} />
          </View>
        ) : null}
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Photo library')}
          disabled={busy}
          onPress={() => void capture(true)}
          style={styles.action}
        >
          <View style={styles.actionInner}>
            <ReceiptIcon name="photo" size={19} color={colors.neutral700} />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Capture receipt')}
          // With permission but no `onCameraReady` yet (first mount, after a flip, after
          // foregrounding) a tap would silently take no picture; keep the ungranted path live so
          // the permission request / Settings redirect still runs.
          disabled={busy || (!!permission?.granted && !ready)}
          onPress={() => void capture(false)}
          style={[styles.shutter, !!permission?.granted && !ready && styles.shutterDisabled]}
        >
          <View style={styles.shutterInner}>
            <ReceiptIcon name="camera" size={20} color={colors.contentB} />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Flip camera')}
          disabled={busy || !permission?.granted}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setReady(false);
            setFacing((f) => (f === 'back' ? 'front' : 'back'));
          }}
          style={styles.action}
        >
          <View style={styles.actionInner}>
            <ReceiptIcon name="flip" size={19} color={colors.neutral700} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
    paddingBottom: 10,
    backgroundColor: colors.neutral50,
  },
  lens: {
    flex: 1,
    borderRadius: 40,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.neutral100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.neutral100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36 },
  action: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF7A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFFBD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFFFFF7A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.3 },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 8px 28px rgba(0,0,0,0.16)',
  },
});
