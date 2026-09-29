import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { GlassSurface } from './GlassSurface';
import { SFSymbol } from './SFSymbol';

export interface BackPillButtonProps {
  onPress: () => void;
  testID?: string;
}

/**
 * "← Back" header button of the keypad-style screens (Add/Edit expense, Edit budget) — a 32pt
 * glass circle with `arrow.left` beside a glass "Back" capsule, port of the header in
 * `EditExpenseView.swift:305-331`. iOS glass floats with a soft drop shadow; each piece carries
 * one so they lift off the grey background (same shadow as `GlassIconButton`).
 */
export function BackPillButton({ onPress, testID }: BackPillButtonProps) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Back')}
      onPress={onPress}
      hitSlop={6}
      style={styles.root}
      testID={testID}
    >
      <View style={[styles.shadow, styles.circleShadow]}>
        <GlassSurface preset="control" radius={16} style={styles.icon}>
          <SFSymbol
            name="arrow.left"
            fallback="arrow-back"
            size={16}
            frame={20}
            color={colors.neutral900}
          />
        </GlassSurface>
      </View>
      <View style={styles.shadow}>
        <GlassSurface preset="control" radius={999} style={styles.label}>
          <Text style={styles.text} numberOfLines={1}>
            {t('Back')}
          </Text>
        </GlassSurface>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  shadow: { borderRadius: 999, boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)' },
  circleShadow: { borderRadius: 16 },
  icon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  label: { paddingHorizontal: 12, paddingVertical: 8 },
  text: { ...beVietnamPro(15), letterSpacing: -0.3, color: colors.neutral900 },
});
