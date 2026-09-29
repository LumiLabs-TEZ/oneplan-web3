/** Port of `Component/Empty/EmptyHome.swift`: illustration, centred copy, optional CTA. */
import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { svg } from '@/ui/assets';
import { Button } from '@/ui/components/Button';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface EmptyHomeProps {
  /** When omitted the "Start new trip" button is hidden. */
  onStartNewTrip?: () => void;
  style?: StyleProp<ViewStyle>;
}

const ILLUSTRATION_SIZE = 191.64;

export function EmptyHome({ onStartNewTrip, style }: EmptyHomeProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const Illustration = svg.illustration.emptyHome;

  return (
    <View style={[styles.root, style]} testID="empty-home">
      <View style={styles.content}>
        <Illustration width={ILLUSTRATION_SIZE} height={ILLUSTRATION_SIZE} />
        <Text style={styles.body}>{t('No trip planned.\nPlan new trip now with friends')}</Text>
      </View>
      {onStartNewTrip ? (
        <Button
          title={t('Start new trip')}
          onPress={onStartNewTrip}
          style={styles.cta}
          testID="empty-home-cta"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', alignSelf: 'stretch', gap: 20 },
  content: { alignItems: 'center', alignSelf: 'stretch', gap: 14 },
  body: {
    ...beVietnamPro(16),
    color: colors.contentM,
    textAlign: 'center',
    letterSpacing: -0.64,
  },
  cta: { width: 220 },
});
