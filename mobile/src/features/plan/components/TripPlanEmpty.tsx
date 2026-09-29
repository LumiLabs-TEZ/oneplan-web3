/**
 * Empty state for a day's timeline. Port of `TripPlanEmpty`
 * (`ios/OnePlan/OnePlan/Component/Trip/TripPlanEmpty.swift`).
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/** iOS stretches the card (`maxHeight: .infinity`); callers pass `flexGrow` via `style`. */
export function TripPlanEmpty({ style }: { style?: StyleProp<ViewStyle> }) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={[styles.root, style]} testID="trip-plan-empty">
      <Text style={styles.title}>{t('No plans')}</Text>
      <Text style={styles.body}>{t('Add your first plan to get started')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderRadius: 24,
  },
  title: { ...beVietnamPro(16, 'medium'), color: colors.contentB, textAlign: 'center' },
  body: { ...beVietnamPro(14), color: colors.contentM, textAlign: 'center' },
});
