/**
 * Port of `ios/OnePlan/OnePlan/Component/Vault/AmountKeypad.swift` — the numeric keypad used to
 * type a vault payment/contribute/withdraw amount. Digits only, no arithmetic; the caller owns
 * the buffer via `useAmountDigits` so it can format it live and decide what an empty value means.
 *
 * Distinct from `@/ui/components/AmountKeypad` (the classic expense keypad, driven by
 * `keypadReducer` + a `Currency`'s `decimalPlaces`): this one takes a plain `allowsDecimal`
 * boolean like its Swift counterpart, fully hides the dot key rather than just disabling it
 * (Swift: `.opacity(allowsDecimal ? 1 : 0)`), and uses a delete *icon* instead of a "DEL" label.
 */
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { SFSymbol } from '@/ui/components/SFSymbol';
import { colors, radius } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const DIGIT_ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

export interface AmountKeypadProps {
  onAppend: (key: string) => void;
  onDelete: () => void;
  /** VND has no minor units; the key still occupies its cell so the grid doesn't reflow. */
  allowsDecimal?: boolean;
}

export function AmountKeypad({ onAppend, onDelete, allowsDecimal = false }: AmountKeypadProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const press = (key: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onAppend(key);
  };
  const del = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onDelete();
  };

  return (
    <View style={styles.grid} testID="vault-amount-keypad">
      {DIGIT_ROWS.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((key) => (
            <DigitKey key={key} digit={key} onPress={() => press(key)} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {/* Neither the decimal nor the delete key has a filled background in the design; only
            the digits do. */}
        <PlainKey
          testID="key-dot"
          onPress={() => press('.')}
          disabled={!allowsDecimal}
          hidden={!allowsDecimal}
        >
          <Text style={styles.dot}>.</Text>
        </PlainKey>

        <DigitKey digit="0" onPress={() => press('0')} />

        <PlainKey testID="key-delete" onPress={del} accessibilityLabel={t('Delete')}>
          <SFSymbol
            name="delete.left"
            fallback="backspace-outline"
            size={18}
            color={colors.neutral950}
          />
        </PlainKey>
      </View>
    </View>
  );
}

function DigitKey({ digit, onPress }: { digit: string; onPress: () => void }) {
  return (
    <Pressable
      testID={`key-${digit}`}
      accessibilityRole="keyboardkey"
      onPress={onPress}
      style={({ pressed }) => [styles.key, styles.keyFilled, pressed && styles.keyPressed]}
    >
      <Text style={styles.digit}>{digit}</Text>
    </Pressable>
  );
}

interface PlainKeyProps {
  children: ReactNode;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
  /** Occupies the cell but draws nothing, like Swift's `.opacity(0)`. */
  hidden?: boolean;
  accessibilityLabel?: string;
}

function PlainKey({
  children,
  onPress,
  testID,
  disabled = false,
  hidden = false,
  accessibilityLabel,
}: PlainKeyProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="keyboardkey"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        hidden && styles.keyHidden,
        pressed && !hidden && styles.keyPressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 5 },
  row: { flexDirection: 'row', gap: 5 },
  key: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  keyFilled: { backgroundColor: colors.background, borderRadius: radius.md },
  keyHidden: { opacity: 0 },
  keyPressed: { opacity: 0.55 },
  digit: { ...beVietnamPro(18, 'semibold'), letterSpacing: -0.36, color: colors.neutral950 },
  dot: { ...beVietnamPro(18, 'regular'), color: colors.neutral950 },
});
