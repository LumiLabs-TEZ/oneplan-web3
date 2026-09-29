import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { CachedImage } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export function ReceiptProgress({ photoUri }: { photoUri?: string }) {
  useAppLanguage();
  const { t } = useTranslation();
  if (photoUri)
    return (
      <View style={styles.parsing}>
        <View style={styles.lens}>
          <CachedImage uri={photoUri} style={StyleSheet.absoluteFill} transition={0} />
          <View style={styles.scrim}>
            <ActivityIndicator color={colors.white} style={{ transform: [{ scale: 1.5 }] }} />
            <Text style={styles.parsingText}>{t('Scanning receipt...')}</Text>
          </View>
        </View>
      </View>
    );
  return (
    <View style={styles.saving}>
      <ActivityIndicator style={{ transform: [{ scale: 1.5 }] }} />
      <Text style={styles.savingText}>{t('Creating expense...')}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  parsing: { flex: 1, paddingTop: 0, paddingHorizontal: 20, paddingBottom: 98 },
  lens: { flex: 1, borderRadius: 40, borderCurve: 'continuous', overflow: 'hidden' },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  parsingText: { ...beVietnamPro(14), color: colors.white },
  saving: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  savingText: { ...beVietnamPro(14), color: colors.contentM },
});
