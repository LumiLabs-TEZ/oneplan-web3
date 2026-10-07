/** `.skr` name (mainnet AllDomains) + Seeker Genesis Token pill. Display only — never gates money. */
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface SeekerIdentityTagProps {
  skrDomain?: string | null;
  isSeeker: boolean;
  fallback: string | null;
}

export function SeekerIdentityTag({ skrDomain, isSeeker, fallback }: SeekerIdentityTagProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const label = skrDomain ? `${skrDomain}.skr` : fallback;
  if (!label && !isSeeker) return null;
  return (
    <View style={styles.row}>
      {label ? (
        <Text style={styles.name} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      {isSeeker ? (
        <View style={styles.pill} testID="seeker-badge">
          <Text style={styles.pillLabel}>{t('Seeker')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...beVietnamPro(13, 'medium'), color: colors.contentM, flexShrink: 1 },
  // Solana green: the Seeker badge is a Solana-ecosystem mark, not a OnePlan brand colour.
  pill: { backgroundColor: '#14F195', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillLabel: { ...beVietnamPro(11, 'semibold'), color: colors.black },
});
