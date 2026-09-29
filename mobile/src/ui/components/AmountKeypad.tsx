/**
 * 3×4 amount keypad — port of `keypadCard` / `KeypadButton` in
 * `ios/OnePlan/OnePlan/Component/Common/AmountKeypadScreen.swift`. State is owned by the
 * caller through `keypadReducer`; this component only renders keys and dispatches.
 */
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  isKeyEnabled,
  type KeypadAction,
  type KeypadKey,
  type KeypadState,
} from '@/features/expense/keypad/keypadReducer';
import { useAppLanguage } from '@/i18n';
import { colors, radius } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const ROWS: KeypadKey[][] = [
  ['1', '2', '3'].map((d) => ({ type: 'digit', digit: d }) as KeypadKey),
  ['4', '5', '6'].map((d) => ({ type: 'digit', digit: d }) as KeypadKey),
  ['7', '8', '9'].map((d) => ({ type: 'digit', digit: d }) as KeypadKey),
  [{ type: 'dot' }, { type: 'digit', digit: '0' }, { type: 'delete' }],
];

function keyId(key: KeypadKey): string {
  return key.type === 'digit' ? `key-${key.digit}` : `key-${key.type}`;
}

export interface AmountKeypadProps {
  state: KeypadState;
  dispatch: (action: KeypadAction) => void;
}

export function AmountKeypad({ state, dispatch }: AmountKeypadProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.grid} testID="amount-keypad">
      {ROWS.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((key) => {
            const enabled = isKeyEnabled(state, key);
            const filled = key.type === 'digit';
            return (
              <Pressable
                key={keyId(key)}
                testID={keyId(key)}
                accessibilityRole="keyboardkey"
                accessibilityLabel={key.type === 'delete' ? t('Delete') : undefined}
                accessibilityState={{ disabled: !enabled }}
                disabled={!enabled}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  dispatch({ type: 'key', key });
                }}
                onLongPress={
                  key.type === 'delete'
                    ? () => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        dispatch({ type: 'clear' });
                      }
                    : undefined
                }
                delayLongPress={450}
                style={({ pressed }) => [
                  styles.key,
                  filled && styles.keyFilled,
                  !enabled && styles.keyDisabled,
                  pressed && styles.keyPressed,
                ]}
              >
                {key.type === 'digit' ? (
                  <Text style={styles.digit}>{key.digit}</Text>
                ) : key.type === 'dot' ? (
                  <Text style={styles.dot}>.</Text>
                ) : (
                  <Text style={styles.del}>DEL</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 5 },
  row: { flexDirection: 'row', gap: 5 },
  key: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  keyFilled: { backgroundColor: colors.background },
  keyDisabled: { opacity: 0.35 },
  keyPressed: { opacity: 0.55 },
  digit: { ...beVietnamPro(18, 'semibold'), letterSpacing: -0.36, color: colors.neutral950 },
  dot: { ...beVietnamPro(18, 'regular'), letterSpacing: -0.36, color: colors.neutral950 },
  del: { ...beVietnamPro(12, 'semibold'), letterSpacing: 0.6, color: colors.neutral600 },
});
