import { Ionicons } from '@expo/vector-icons';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { GestureTrigger } from 'react-native-gesture-image-viewer';

import { useAppLanguage } from '@/i18n';
import { CachedImage, ImageViewerModal } from '@/ui/components';
import { colors } from '@/ui/theme';

export interface PlanImageStripProps {
  images: readonly string[];
  size?: number;
  /** When provided, thumbnails show a remove (X) button instead of opening the viewer on tap. */
  onRemove?: (index: number) => void;
  testID?: string;
}

/**
 * Horizontal strip of square thumbnails with source/return hero transition (skipped when `onRemove` is set,
 * i.e. the editor's own upload preview strip).
 */
export function PlanImageStrip({ images, size = 112, onRemove, testID }: PlanImageStripProps) {
  const viewerId = useId();
  const strip = useRef<ScrollView>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  useAppLanguage();
  const { t } = useTranslation();

  if (images.length === 0) return null;

  return (
    <>
      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        testID={testID}
        contentContainerStyle={styles.row}
      >
        {images.map((uri, index) => (
          <GestureTrigger
            key={`${uri}-${index}`}
            id={viewerId}
            index={index}
            onPress={() => {
              setViewerIndex(index);
              setSelectedIndex(index);
            }}
          >
            <Pressable
              disabled={!!onRemove}
              style={[styles.thumb, { width: size, height: size }]}
              testID={testID ? `${testID}-thumb-${index}` : undefined}
            >
              <CachedImage
                uri={uri}
                contentFit="cover"
                style={[
                  StyleSheet.absoluteFill,
                  viewerIndex !== null && selectedIndex === index && { opacity: 0 },
                ]}
              />
              {onRemove ? (
                <Pressable
                  accessibilityLabel={t('Remove')}
                  onPress={() => onRemove(index)}
                  style={styles.removeButton}
                  testID={testID ? `${testID}-remove-${index}` : undefined}
                >
                  <Ionicons name="close" size={14} color={colors.white} />
                </Pressable>
              ) : null}
            </Pressable>
          </GestureTrigger>
        ))}
      </ScrollView>
      {!onRemove ? (
        <ImageViewerModal
          images={images}
          triggerId={viewerId}
          onIndexChange={(index) => {
            setSelectedIndex(index);
            strip.current?.scrollTo({ x: index * (size + 8), animated: false });
          }}
          initialIndex={viewerIndex ?? 0}
          visible={viewerIndex !== null}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8 },
  thumb: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.neutral100 },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
