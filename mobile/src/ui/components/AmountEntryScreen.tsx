/**
 * Shared amount-keypad screen shell — port of the common structure in
 * `ios/OnePlan/OnePlan/Component/Common/AmountKeypadScreen.swift`, used by both the add-expense
 * and add-budget flows (`AddExpenseView.swift` / `AddBudgetView.swift` differ only in the
 * trailing header accessory and the caption). Owns the back header, currency chip + picker,
 * 48pt amount display, caption and the keypad card with its "Next" button; the details sheet is
 * passed in as `children` so it mounts alongside without this component knowing its shape.
 */
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BlurTargetView } from 'expo-blur';
import { GlassBackdropContext } from './GlassBackdrop';
import { useTranslation } from 'react-i18next';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  canContinue,
  displayParts,
  displayText,
  type KeypadAction,
  type KeypadState,
} from '@/features/expense/keypad/keypadReducer';
import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { AmountKeypad } from './AmountKeypad';
import { Button } from './Button';
import { BackPillButton } from './BackPillButton';
import { GlassSurface } from './GlassSurface';
import { amountFontSize } from './amountFontSize';
import { NumericText } from './NumericText';

/** Horizontal inset of the amount display (each side). */
const AMOUNT_INSET = 24;

export interface AmountEntryScreenProps {
  onBack: () => void;
  /** Rendered top-right in the header (e.g. a "Scan bill" pill or a "Balance" pill). */
  trailingAccessory?: ReactNode;
  /** Small text under the amount (FX preview for expenses, static "Per person" for budgets). */
  caption: string;
  keypad: KeypadState;
  dispatch: (action: KeypadAction) => void;
  /** Currencies offered in the switcher; the chip is inert when fewer than two are given. */
  currencies: readonly Currency[];
  onNext: () => void;
  /** The details sheet (or any content) mounted alongside the keypad. */
  children?: ReactNode;
}

export function AmountEntryScreen({
  onBack,
  trailingAccessory,
  caption,
  keypad,
  dispatch,
  currencies,
  onNext,
  children,
}: AmountEntryScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const amount = displayParts(keypad);
  const [amountSlotHeight, setAmountSlotHeight] = useState(0);
  const amountSize = amountFontSize(displayText(keypad), windowWidth - AMOUNT_INSET * 2);
  const backdrop = useRef<View>(null);
  const [backdropReady, setBackdropReady] = useState(false);
  const attachBackdrop = useCallback((view: View | null) => {
    backdrop.current = view;
    setBackdropReady(Boolean(view));
  }, []);

  const pickCurrency = () => {
    if (currencies.length < 2) return;
    const labels = currencies.map((c) => `${c.name} (${c.code})`);
    const choose = (i: number) => {
      const c = currencies[i];
      if (c) dispatch({ type: 'setCurrency', currency: c });
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, t('Cancel')], cancelButtonIndex: labels.length },
        (i) => {
          if (i < labels.length) choose(i);
        },
      );
    } else {
      Alert.alert(t('Currency'), undefined, [
        ...labels.map((label, i) => ({ text: label, onPress: () => choose(i) })),
        { text: t('Cancel'), style: 'cancel' as const },
      ]);
    }
  };

  return (
    <GlassBackdropContext.Provider value={{ ref: backdrop, ready: backdropReady }}>
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <BlurTargetView
          ref={attachBackdrop as unknown as RefObject<View | null>}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        >
          {/* The fill must be a child: Android `BlurTargetView` wraps the real Dimezis
              `BlurTarget` and only captures that inner view's children, never the host's own
              background — an empty target blurs the black window background to grey. */}
          <View collapsable={false} style={styles.backdropFill} />
        </BlurTargetView>
        <View style={styles.header}>
          <BackPillButton onPress={onBack} />
          {trailingAccessory}
        </View>

        <View style={styles.amountBlock}>
          <Pressable
            accessibilityRole="button"
            disabled={currencies.length < 2}
            onPress={pickCurrency}
            testID="amount-entry-currency-chip"
          >
            <GlassSurface preset="control" radius={16} style={styles.chip}>
              <Text style={styles.chipText}>{keypad.currency.code}</Text>
              {currencies.length >= 2 ? (
                <Ionicons name="chevron-down" size={10} color={colors.neutral900} />
              ) : null}
            </GlassSurface>
          </Pressable>
          {/* Holds the 48pt line height while the font steps down, so the chip and caption
              don't move as the amount grows. */}
          <View
            style={[styles.amountSlot, { minHeight: amountSlotHeight }]}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              setAmountSlotHeight((prev) => Math.max(prev, h));
            }}
          >
            <NumericText
              value={amount.value}
              minimumIntegerDigits={amount.integerDigits}
              minimumFractionDigits={amount.fractionDigits}
              maximumFractionDigits={amount.fractionDigits}
              suffix={amount.trailingDot ? '.' : undefined}
              style={[
                styles.amount,
                { fontSize: amountSize },
                keypad.raw === '' && styles.amountEmpty,
              ]}
              containerStyle={styles.amountRow}
              accessibilityLabel={t('Amount')}
              testID="amount-entry-display"
            />
          </View>
          <Text style={styles.caption} numberOfLines={1}>
            {caption}
          </Text>
        </View>

        <View style={[styles.keypadCard, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
          <AmountKeypad state={keypad} dispatch={dispatch} />
          <Button
            variant="primary"
            title={t('Next')}
            onPress={onNext}
            disabled={!canContinue(keypad)}
            style={[styles.next, !canContinue(keypad) && { opacity: 0.45 }]}
            testID="amount-entry-next"
          />
        </View>

        {children}
      </View>
    </GlassBackdropContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  backdropFill: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  amountBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { ...beVietnamPro(16, 'regular'), letterSpacing: -0.32, color: colors.neutral900 },
  amountSlot: { alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center' },
  // Padding lives on the row: on the number's own style it would offset the sizing text from
  // the native overlay.
  amountRow: { paddingHorizontal: AMOUNT_INSET },
  amount: {
    ...beVietnamPro(48, 'regular'),
    letterSpacing: -2.4,
    color: colors.neutral950,
  },
  amountEmpty: { color: colors.contentL },
  caption: { ...beVietnamPro(14, 'regular'), letterSpacing: -0.56, color: colors.neutral600 },
  keypadCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 9,
    elevation: 6,
  },
  next: { marginHorizontal: 16, backgroundColor: colors.contentB },
});
