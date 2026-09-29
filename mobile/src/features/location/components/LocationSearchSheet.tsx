/**
 * Sheet form of `TripLocationPickerSheet.swift` for flows that already live in a bottom sheet
 * (Request a plan) — a route would present underneath the gorhom portal.
 */
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { components } from '@/api/schema';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef, DismissButton } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { LocationSearchContent } from './LocationSearchContent';

export interface LocationSearchSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const LocationSearchSheet = forwardRef<
  LocationSearchSheetRef,
  { onSelect: (result: components['schemas']['LocationSearchResultDto']) => void }
>(function LocationSearchSheet({ onSelect }, ref) {
  useAppLanguage();
  const { t } = useTranslation();
  const sheetRef = useRef<AppSheetRef>(null);

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  return (
    <AppSheet ref={sheetRef} snapPoints={['94%']} stackBehavior="push">
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>{t('Select Location')}</Text>
        <DismissButton onPress={() => sheetRef.current?.dismiss()} />
      </View>
      <LocationSearchContent
        inSheet
        autoFocus={false}
        onSelect={(result) => {
          onSelect(result);
          sheetRef.current?.dismiss();
        }}
      />
    </AppSheet>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  headerSpacer: { width: 32 },
  headerTitle: { ...beVietnamPro(17, 'semibold'), color: colors.contentB },
});
