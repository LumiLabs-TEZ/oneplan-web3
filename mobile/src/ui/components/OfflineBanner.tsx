import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { formatRelativeUpdated } from '@/ui/relativeTime';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface OfflineBannerProps {
  /** Epoch ms of the cached data being displayed. Drives the "updated …" suffix. */
  cachedAt?: number | null;
  style?: StyleProp<ViewStyle>;
}

const REFRESH_MS = 60_000;

/** Current time, re-read every `intervalMs` so the relative label does not go stale on screen. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Port of `Component/Common/OfflineBanner.swift`. */
export function OfflineBanner({ cachedAt, style }: OfflineBannerProps) {
  const language = useAppLanguage();
  const { t } = useTranslation();
  const now = useNow(REFRESH_MS);
  const message = cachedAt
    ? t('Offline · updated {{0}}', { 0: formatRelativeUpdated(cachedAt, now, t, language) })
    : t('Offline');

  return (
    <View
      style={[styles.banner, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={message}
    >
      <Ionicons name="cloud-offline-outline" size={14} color={colors.warning500} />
      <Text style={styles.text} numberOfLines={1} ellipsizeMode="tail">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.warning500 + '1F',
  },
  text: { ...beVietnamPro(12, 'medium'), color: colors.black, flexShrink: 1 },
});
