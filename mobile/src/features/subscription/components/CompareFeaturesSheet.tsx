/**
 * Compare-features sheet — port of `CompareFeatureView` (CompareFeatureView.swift). Two tables:
 * "Unlock with Pro" (Basic vs Pro differ) and "Included in all plans" (both checkmarked).
 */
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import {
  COMPARE_ROWS,
  type CompareFeatureRow,
  type FeatureValue,
} from '@/features/subscription/helpers/paywall';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef, DismissButton } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface CompareFeaturesSheetRef {
  present: () => void;
  dismiss: () => void;
}

function Cell({ value }: { value: FeatureValue }) {
  if (value.kind === 'check') {
    return (
      <View style={styles.cell}>
        <Ionicons name="checkmark-circle" size={17} color={colors.blueBase} />
      </View>
    );
  }
  return (
    <View style={styles.cell}>
      <Text style={styles.cellText} numberOfLines={1}>
        {value.text}
      </Text>
    </View>
  );
}

function Row({ row, showTopDivider }: { row: CompareFeatureRow; showTopDivider: boolean }) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <View style={[styles.row, showTopDivider && styles.rowTopDivider]}>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {t(row.title)}
      </Text>
      <View style={styles.rowValues}>
        <Cell value={row.basic} />
        <Cell value={row.pro} />
      </View>
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: 'crown' | 'check'; title: string }) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <View style={styles.sectionHeader}>
      <Ionicons
        name={icon === 'crown' ? 'ribbon' : 'checkmark-circle'}
        size={17}
        color={colors.blueBase}
      />
      <Text style={styles.sectionTitle} numberOfLines={1}>
        {t(title)}
      </Text>
      <View style={styles.columnHeaders}>
        <Text style={styles.columnHeaderBasic}>{t('Basic')}</Text>
        <View style={styles.proColumnHeader}>
          <Text style={styles.columnHeaderPro}>{t('Pro')}</Text>
        </View>
      </View>
    </View>
  );
}

/** `AppSheet`-wrapping compare table. Present/dismiss imperatively via the forwarded ref. */
export const CompareFeaturesSheet = forwardRef<CompareFeaturesSheetRef, object>(
  function CompareFeaturesSheet(_props, ref) {
    useAppLanguage();
    const { t } = useTranslation();
    const sheetRef = useRef<AppSheetRef>(null);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    return (
      <AppSheet ref={sheetRef} snapPoints={['92%']}>
        <View testID="compare-features-sheet">
          <View style={styles.header}>
            <Text style={styles.title}>{t('Compare features')}</Text>
            <DismissButton
              onPress={() => sheetRef.current?.dismiss()}
              accessibilityLabel={t('Close')}
            />
          </View>
          <Text style={styles.subtitle}>
            {t(
              'OnePlan combines your essential travel planning tools in one place, helping you organize trips more easily and unlock more powerful features with Pro.',
            )}
          </Text>

          <SectionHeader icon="crown" title="Unlock with Pro" />
          {COMPARE_ROWS.unlock.map((row, index) => (
            <Row key={row.title} row={row} showTopDivider={index === 0} />
          ))}

          <SectionHeader icon="check" title="Included in all plans" />
          {COMPARE_ROWS.included.map((row, index) => (
            <Row key={row.title} row={row} showTopDivider={index === 0} />
          ))}
        </View>
      </AppSheet>
    );
  },
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { ...beVietnamPro(20, 'semibold'), color: colors.contentB },
  subtitle: {
    ...beVietnamPro(13, 'regular'),
    color: colors.contentB,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  sectionTitle: { ...beVietnamPro(14, 'regular'), color: colors.blueBase, flex: 1 },
  columnHeaders: { flexDirection: 'row', width: 122 },
  columnHeaderBasic: {
    ...beVietnamPro(14, 'regular'),
    color: colors.contentB,
    flex: 1,
    textAlign: 'center',
  },
  proColumnHeader: {
    flex: 1,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.blueBase,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columnHeaderPro: { ...beVietnamPro(14, 'regular'), color: colors.blueBase },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral200,
  },
  rowTopDivider: { borderTopWidth: 1, borderTopColor: colors.neutral200 },
  rowTitle: { ...beVietnamPro(14, 'regular'), color: colors.contentB, flex: 1 },
  rowValues: { flexDirection: 'row', width: 122 },
  cell: { width: 61, alignItems: 'center' },
  cellText: { ...beVietnamPro(13, 'regular'), color: colors.contentB },
});
