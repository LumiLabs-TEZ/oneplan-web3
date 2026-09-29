/**
 * Language picker — port of `Component/BottomSheet/LanguagePickerBottomSheet.swift`. Pending
 * selection only reaches the caller on the checkmark ("confirm-only" — same contract as
 * `CurrencyPickerSheet`). Autonyms (`AppLanguage.displayName`) are shown verbatim, never
 * localized.
 */
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type AppLanguage, APP_LANGUAGES } from '@/stores/settingsStore';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef, Button } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const LANGUAGE_META: Record<AppLanguage, { flag: string; autonym: string }> = {
  en: { flag: '🇬🇧', autonym: 'English' },
  vi: { flag: '🇻🇳', autonym: 'Tiếng Việt' },
};

export interface LanguagePickerSheetProps {
  value: AppLanguage;
  onConfirm: (language: AppLanguage) => void;
}

export interface LanguagePickerSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const LanguagePickerSheet = forwardRef<LanguagePickerSheetRef, LanguagePickerSheetProps>(
  function LanguagePickerSheet({ value, onConfirm }, ref) {
    useAppLanguage();
    const { t } = useTranslation();
    const sheetRef = useRef<AppSheetRef>(null);
    const [pending, setPending] = useState<AppLanguage>(value);

    useImperativeHandle(ref, () => ({
      present: () => {
        setPending(value);
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
        snapPoints={[320]}
        // Swift `.background(Constants.Background)` — rows share the fill, so they read as plain.
        backgroundColor={colors.background}
      >
        <View style={styles.toolbar}>
          <Button
            variant="toolbarIcon"
            onPress={() => sheetRef.current?.dismiss()}
            accessibilityLabel={t('Cancel')}
            testID="language-dismiss"
            icon={<Ionicons name="close" size={18} color={colors.contentM} />}
            style={styles.toolbarButton}
          />
          <Text style={styles.toolbarTitle}>{t('Language')}</Text>
          <Button
            variant="toolbarIcon"
            onPress={handleConfirm}
            accessibilityLabel={t('Confirm')}
            testID="language-confirm"
            icon={<Ionicons name="checkmark" size={18} color={colors.white} />}
            style={[styles.toolbarButton, styles.confirmButton]}
          />
        </View>

        <View style={styles.list}>
          {APP_LANGUAGES.map((language) => {
            const meta = LANGUAGE_META[language];
            const isSelected = pending === language;
            return (
              <Pressable
                key={language}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                testID={`language-row-${language}`}
                onPress={() => setPending(language)}
                style={styles.row}
              >
                <View
                  style={[styles.indicator, isSelected ? styles.indicatorOn : styles.indicatorOff]}
                >
                  {isSelected ? <Ionicons name="checkmark" size={11} color={colors.white} /> : null}
                </View>
                <Text style={styles.flag}>{meta.flag}</Text>
                <Text style={styles.autonym} numberOfLines={1}>
                  {meta.autonym}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </AppSheet>
    );
  },
);

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
  list: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 19,
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
  flag: { fontSize: 24 },
  autonym: { ...beVietnamPro(16), color: colors.contentB, letterSpacing: -0.32, flexShrink: 1 },
});
