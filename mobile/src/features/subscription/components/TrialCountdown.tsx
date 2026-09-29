/**
 * Free-trial countdown cells — port of `FreeTrialView.countdownSection` (:198-225, `CountdownCell`
 * :460-484). Pure presentational: the 1s tick lives in `useFreeTrial`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View } from 'react-native';

import type { TrialCountdownValue } from '@/features/subscription/helpers/trialWindow';
import { CachedImage, NumericText } from '@/ui/components';
import { useAppLanguage } from '@/i18n';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface TrialCountdownProps {
  remaining: TrialCountdownValue;
  testID?: string;
}

function Cell({ value, unit, testID }: { value: number; unit: string; testID?: string }) {
  return (
    <View style={styles.cell} testID={testID}>
      <NumericText value={value} style={styles.value} />
      <Text style={styles.unit}>{unit}</Text>
    </View>
  );
}

export function TrialCountdown({ remaining, testID }: TrialCountdownProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.root} testID={testID}>
      <Text style={styles.label}>{t('Expires in')}</Text>

      <View style={styles.cells}>
        <Cell value={remaining.hrs} unit={t('hrs')} testID={`${testID}-hrs`} />
        <Cell value={remaining.min} unit={t('min')} testID={`${testID}-min`} />
        <Cell value={remaining.sec} unit={t('sec')} testID={`${testID}-sec`} />
      </View>

      <View style={styles.noPaymentRow}>
        {Platform.OS === 'ios' ? (
          <CachedImage
            uri="sf:/receipt.fill"
            transition={0}
            contentFit="contain"
            style={{ width: 19, height: 19, fontSize: 15, fontWeight: '600', tintColor: '#057A54' }}
          />
        ) : (
          <Ionicons name="receipt" size={15} color="#057A54" />
        )}
        <Text style={styles.noPayment}>{t('No Payment today')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.md },
  label: { ...beVietnamPro(15, 'regular'), letterSpacing: -0.45, color: colors.contentB },
  cells: { flexDirection: 'row', gap: 13 },
  cell: {
    width: 78,
    height: 75,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F5F5F5',
    backgroundColor: 'rgba(54,54,54,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { ...beVietnamPro(32, 'medium'), letterSpacing: -1.28, color: colors.neutral950 },
  unit: { ...beVietnamPro(15, 'regular'), letterSpacing: -0.45, color: colors.neutral400 },
  noPaymentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  noPayment: { ...beVietnamPro(14, 'medium'), letterSpacing: -0.42, color: '#057A54' },
});
