/**
 * Shared album card on the trip-end History tab — port of the "Shared Album" block of
 * `View/Trip/TripEnd/TripEndHistory.swift` (:97-190). Shows the photo count, a tilted
 * 3-photo preview stack and one button that cycles Download all → done/total → Saved N.
 *
 * ASSET SUBSTITUTION: iOS uses the bundled `polarizedCamera` artwork; the RN bundle has no
 * equivalent yet, so an Ionicons camera stands in.
 */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { Button, CachedImage } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/** Owned by the screen so the card stays presentational. */
export type DownloadState =
  | { kind: 'idle' }
  | { kind: 'downloading'; done: number; total: number }
  | { kind: 'done'; saved: number };

export interface SharedAlbumCardProps {
  photoCount: number;
  /** Up to three cover URLs for the preview stack. */
  previews: readonly (string | null | undefined)[];
  state: DownloadState;
  /** Album still paging in — the count/total are provisional, so the download must wait. */
  disabled?: boolean;
  onDownload: () => void;
}

const ROTATIONS = ['-13.75deg', '9.52deg', '0deg'];
const OFFSETS = [-56, -8, 40];

export function SharedAlbumCard({
  photoCount,
  previews,
  state,
  disabled = false,
  onDownload,
}: SharedAlbumCardProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const buttonTitle =
    state.kind === 'done'
      ? t('Saved %lld', { 0: state.saved })
      : state.kind === 'downloading'
        ? `${state.done}/${state.total}`
        : t('Download all');

  return (
    <View style={styles.card} testID="shared-album-card">
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name="camera-outline" size={28} color={colors.contentM} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('Shared album')}</Text>
          <Text style={styles.subtitle}>
            {t('%lld photos uploaded by all members.', { count: photoCount })}
          </Text>
        </View>
        <Button
          title={buttonTitle}
          disabled={disabled || state.kind !== 'idle'}
          onPress={onDownload}
          style={styles.button}
          testID="shared-album-download"
        />
      </View>

      {state.kind === 'downloading' ? (
        <View style={styles.progress} testID="shared-album-progress">
          <Text style={styles.progressText}>{t('Saving to camera roll...')}</Text>
        </View>
      ) : (
        <View style={styles.stack} testID="shared-album-previews">
          {previews.slice(0, 3).map((uri, index) => (
            <View
              key={`${uri ?? 'empty'}-${index}`}
              style={[
                styles.preview,
                {
                  transform: [
                    { translateX: OFFSETS[index] ?? 0 },
                    { rotate: ROTATIONS[index] ?? '0deg' },
                  ],
                },
              ]}
            >
              <CachedImage uri={uri} style={styles.previewImage} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.sm,
    gap: spacing.sm,
    height: 185,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: spacing.sm },
  icon: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral50,
  },
  headerText: { flex: 1, gap: spacing.xs },
  title: { ...beVietnamPro(14), color: colors.contentB },
  subtitle: { ...beVietnamPro(14), color: colors.contentM },
  button: { height: 40, paddingHorizontal: spacing.lg },
  progress: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xl, alignItems: 'center' },
  progressText: { ...beVietnamPro(12), color: colors.contentM },
  stack: {
    height: 95,
    borderRadius: radius.lg,
    backgroundColor: colors.neutral50,
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  preview: {
    position: 'absolute',
    left: '50%',
    top: 30,
    width: 88,
    height: 108,
    marginLeft: -44,
    borderRadius: radius.lg,
    borderWidth: 1.4,
    borderColor: colors.contentM,
    backgroundColor: colors.black,
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%' },
});
