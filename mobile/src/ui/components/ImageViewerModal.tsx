import { useEffect, useEffectEvent, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, View } from 'react-native';
import { GestureViewer, useGestureViewerState } from 'react-native-gesture-image-viewer';
import { ReduceMotion } from 'react-native-reanimated';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { DismissButton } from './AppSheet';
import { CachedImage } from './CachedImage';
import { NumericText } from './NumericText';

export interface ImageViewerModalProps {
  images: readonly string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  /**
   * Viewer group shared with `GestureTrigger id` on the thumbnails. When set, the viewer
   * hero-opens from the tapped thumbnail and dismisses back to the current one.
   */
  triggerId?: string;
  onIndexChange?: (index: number) => void;
}

/** Full-screen paged image viewer (pinch, double tap, swipe-down dismiss) — iOS `HeroLightbox` parity. */
export function ImageViewerModal({
  images,
  initialIndex,
  visible,
  onClose,
  triggerId,
  onIndexChange,
}: ImageViewerModalProps) {
  const fallbackId = useId();
  const id = triggerId ?? fallbackId;
  const startIndex = Math.max(0, Math.min(initialIndex, images.length - 1));
  const dismissRef = useRef<() => void>(onClose);
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => dismissRef.current()}
      testID="image-viewer"
    >
      <GestureViewer
        id={id}
        data={images as string[]}
        initialIndex={startIndex}
        maxZoomScale={4}
        triggerAnimation={{ duration: 300, reduceMotion: ReduceMotion.System }}
        backdropStyle={styles.backdrop}
        renderItem={(uri) => <CachedImage uri={uri} contentFit="contain" style={styles.image} />}
        onDismiss={onClose}
        renderContainer={(children, { dismiss }) => {
          dismissRef.current = dismiss;
          return (
            <Chrome
              id={id}
              initialIndex={startIndex}
              total={images.length}
              onClose={dismiss}
              onIndexChange={onIndexChange}
            >
              {children}
            </Chrome>
          );
        }}
      />
    </Modal>
  );
}

function Chrome({
  id,
  initialIndex,
  total,
  onClose,
  onIndexChange,
  children,
}: {
  id: string;
  initialIndex: number;
  total: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  children: React.ReactElement;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const { currentIndex, totalCount } = useGestureViewerState(id);
  // The viewer registers after mount; until then its state reads index 0.
  const index = totalCount > 0 ? currentIndex : initialIndex;
  const reportIndex = useEffectEvent((next: number) => onIndexChange?.(next));
  useEffect(() => {
    if (totalCount > 0) reportIndex(currentIndex);
  }, [currentIndex, totalCount]);
  return (
    <View style={styles.root} onAccessibilityEscape={onClose}>
      {children}
      <View style={styles.header}>
        <NumericText value={index + 1} suffix={`/${total}`} style={styles.counter} />
        <DismissButton onPress={onClose} accessibilityLabel={t('Close')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: '#000' },
  image: { width: '100%', height: '100%' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  counter: { ...beVietnamPro(14, 'medium'), color: colors.white },
});
