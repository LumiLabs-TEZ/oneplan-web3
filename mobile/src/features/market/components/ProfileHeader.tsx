import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useAppLanguage } from '@/i18n';
import { Avatar } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const AVATAR = 72;
const RING = 2.48;

export function ProfileHeader({
  name,
  avatarUrl,
  createdAt,
  appliedCount,
}: {
  name?: string;
  avatarUrl?: string | null;
  createdAt?: string;
  appliedCount?: number;
}) {
  const language = useAppLanguage();
  const { t } = useTranslation();
  const date = createdAt ? new Date(createdAt) : undefined;
  const member =
    date && Number.isFinite(date.getTime())
      ? t('Member since %@', {
          0: new Intl.DateTimeFormat(language, { month: 'short', year: 'numeric' }).format(date),
        })
      : t('Member');
  return (
    <View style={styles.header}>
      <View>
        <Avatar size={AVATAR} uri={avatarUrl} />
        {/* `MarketProfileHeader.swift`: stroke overlay centered on the edge. A `borderWidth` on the
            frame itself would push the photo 2.48pt right/down off-center. */}
        <View pointerEvents="none" style={styles.ring} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>
          {name ?? t('Creator')}
        </Text>
        <View style={styles.row}>
          <Text style={styles.meta}>
            {t('%@ Applied', { 0: appliedCount === undefined ? '--' : String(appliedCount) })}
          </Text>
          <View style={styles.dot} />
          <Text style={styles.meta}>{member}</Text>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 19, paddingBottom: 8 },
  ring: {
    position: 'absolute',
    top: -RING / 2,
    left: -RING / 2,
    width: AVATAR + RING,
    height: AVATAR + RING,
    borderRadius: (AVATAR + RING) / 2,
    borderWidth: RING,
    borderColor: '#000',
  },
  copy: { alignItems: 'center', gap: 8 },
  name: { ...beVietnamPro(20), color: colors.contentB },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { ...beVietnamPro(14), letterSpacing: -0.6, color: colors.contentM },
  dot: { width: 3.8, height: 3.8, borderRadius: 2, backgroundColor: colors.contentM },
});
