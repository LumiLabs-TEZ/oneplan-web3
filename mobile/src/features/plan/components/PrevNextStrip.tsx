/**
 * Prev/Next sibling nav strip for the plan-detail screen. Port of
 * `PlanDetailPrevNextStrip.swift` (:15-40): static `t('Prev')`/`t('Next')`
 * labels with the icon first, a 38pt-high row with a 1px `neutral100` rule
 * behind it, light haptic + 0.94 press scale on tap, disabled at either end.
 * Generic over the sibling type so the expense detail can reuse it with ids.
 */
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { SFSymbol } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PrevNextStripProps<T> {
  prev: T | null;
  next: T | null;
  onPrev: (item: T) => void;
  onNext: (item: T) => void;
  /** `${prefix}-prev` / `${prefix}-next` test IDs. */
  testIDPrefix?: string;
}

export function PrevNextStrip<T>({
  prev,
  next,
  onPrev,
  onNext,
  testIDPrefix = 'plan-detail',
}: PrevNextStripProps<T>) {
  useAppLanguage();
  const { t } = useTranslation();

  const press = (item: T | null, action: (item: T) => void) => {
    if (item == null) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action(item);
  };

  return (
    <View style={styles.root}>
      <View style={styles.rule} />

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Prev')}
          disabled={prev == null}
          onPress={() => press(prev, onPrev)}
          style={({ pressed }) => [
            styles.button,
            pressed && prev != null && styles.pressed,
            prev == null && styles.disabled,
          ]}
          testID={`${testIDPrefix}-prev`}
        >
          <SFSymbol
            name="arrow.left"
            fallback="arrow-back"
            size={17}
            frame={22}
            color={colors.contentB}
          />
          <Text style={styles.label} numberOfLines={1}>
            {t('Prev')}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Next')}
          disabled={next == null}
          onPress={() => press(next, onNext)}
          style={({ pressed }) => [
            styles.button,
            pressed && next != null && styles.pressed,
            next == null && styles.disabled,
          ]}
          testID={`${testIDPrefix}-next`}
        >
          <SFSymbol
            name="arrow.right"
            fallback="arrow-forward"
            size={17}
            frame={22}
            color={colors.contentB}
          />
          <Text style={styles.label} numberOfLines={1}>
            {t('Next')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: 38, justifyContent: 'center' },
  rule: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: colors.neutral100,
  },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 0.8,
    borderColor: colors.neutral100,
    boxShadow: '0px 0px 2px rgba(0, 0, 0, 0.1), 0px 1px 8px rgba(0, 0, 0, 0.12)',
  },
  pressed: { transform: [{ scale: 0.94 }] },
  disabled: { opacity: 0.35 },
  label: { ...beVietnamPro(14), color: colors.contentB, letterSpacing: -0.7 },
});
