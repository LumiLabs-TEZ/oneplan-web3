/**
 * Currency picker — port of `Component/BottomSheet/CurrencyPickerBottomSheet.swift`.
 * xmark / "Currency" / checkmark toolbar, an optional "None" row (local currency only), and
 * one row per catalog currency. The selection is a local draft that only reaches the caller
 * on Confirm — iOS commits on dismiss, but with an explicit check button in the toolbar the
 * confirm-only commit is the intended RN behaviour.
 */
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { components } from '@/api/schema';
import { CURRENCY_CATALOG_FALLBACK, useCurrencies } from '@/features/currency/api/queries';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef, Button } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export type CurrencyPickerCode = components['schemas']['Currency'];

export interface CurrencyPickerSheetProps {
  /** Current committed selection; re-primed as the draft on every `present()`. */
  selected: CurrencyPickerCode | null;
  /** Local currency is optional, so its picker offers a "None" row (`showsNoneOption`). */
  showsNoneOption?: boolean;
  onConfirm: (code: CurrencyPickerCode | null) => void;
  /** Namespaces the testIDs so a screen hosting both pickers can target each one. */
  testIDPrefix?: string;
  /** `'push'` when presented from inside another sheet (Request a plan). */
  stackBehavior?: 'push' | 'switch' | 'replace';
}

export interface CurrencyPickerSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const CurrencyPickerSheet = forwardRef<CurrencyPickerSheetRef, CurrencyPickerSheetProps>(
  function CurrencyPickerSheet(
    { selected, showsNoneOption = false, onConfirm, testIDPrefix = 'currency', stackBehavior },
    ref,
  ) {
    useAppLanguage();
    const { t } = useTranslation();
    const sheetRef = useRef<AppSheetRef>(null);
    const [pending, setPending] = useState<CurrencyPickerCode | null>(selected);
    const catalog = useCurrencies().data ?? CURRENCY_CATALOG_FALLBACK;

    useImperativeHandle(ref, () => ({
      present: () => {
        setPending(selected);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const handleConfirm = () => {
      sheetRef.current?.dismiss();
      onConfirm(pending);
    };

    return (
      <AppSheet
        ref={sheetRef}
        snapPoints={[560]}
        stackBehavior={stackBehavior}
        // Swift `.background(Constants.Background)` — rows share the fill, so they read as plain.
        backgroundColor={colors.background}
      >
        <View style={styles.toolbar}>
          <Button
            variant="toolbarIcon"
            onPress={() => sheetRef.current?.dismiss()}
            accessibilityLabel={t('Cancel')}
            testID={`${testIDPrefix}-dismiss`}
            icon={<Ionicons name="close" size={18} color={colors.contentM} />}
            style={styles.toolbarButton}
          />
          <Text style={styles.toolbarTitle}>{t('Currency')}</Text>
          <Button
            variant="toolbarIcon"
            onPress={handleConfirm}
            accessibilityLabel={t('Confirm')}
            testID={`${testIDPrefix}-confirm`}
            icon={<Ionicons name="checkmark" size={18} color={colors.white} />}
            style={[styles.toolbarButton, styles.confirmButton]}
          />
        </View>

        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {showsNoneOption ? (
            <Row
              testID={`${testIDPrefix}-row-none`}
              title={t('None')}
              subtitle={t('No local currency')}
              isSelected={pending === null}
              onPress={() => setPending(null)}
              boldTitle
            />
          ) : null}
          {catalog.map((currency) => (
            <Row
              key={currency.code}
              testID={`${testIDPrefix}-row-${currency.code}`}
              title={currency.name}
              subtitle={`${currency.code} (${currency.symbol})`}
              isSelected={pending === currency.code}
              onPress={() => setPending(currency.code)}
            />
          ))}
        </BottomSheetScrollView>
      </AppSheet>
    );
  },
);

function Row({
  testID,
  title,
  subtitle,
  isSelected,
  onPress,
  boldTitle = false,
}: {
  testID: string;
  title: string;
  subtitle: string;
  isSelected: boolean;
  onPress: () => void;
  boldTitle?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={title}
      testID={testID}
      onPress={onPress}
      style={styles.row}
    >
      <View style={[styles.indicator, isSelected ? styles.indicatorOn : styles.indicatorOff]}>
        {isSelected ? <Ionicons name="checkmark" size={11} color={colors.white} /> : null}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, boldTitle ? styles.rowTitleBold : null]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  toolbarButton: { width: 43, height: 43, borderRadius: 22, backgroundColor: colors.onSurface },
  confirmButton: { backgroundColor: colors.blueBase },
  toolbarTitle: { ...beVietnamPro(18), color: colors.contentB },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.background,
  },
  indicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorOn: { backgroundColor: colors.blueBase },
  indicatorOff: { borderWidth: 1.5, borderColor: colors.contentL },
  rowText: { flex: 1, gap: spacing.xxs },
  rowTitle: { ...beVietnamPro(16), color: colors.contentB },
  rowTitleBold: { ...beVietnamPro(16, 'bold') },
  rowSubtitle: { ...beVietnamPro(13), color: colors.contentM },
});
