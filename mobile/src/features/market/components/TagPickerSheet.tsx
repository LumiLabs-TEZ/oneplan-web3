/**
 * "Plan for" picker — port of `Component/BottomSheet/TagPickerBottomSheet.swift`.
 * xmark / "Plan for" / checkmark toolbar over five radio rows; the draft is primed from
 * `selected` on every `present()` and only reaches the caller on the checkmark.
 */
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { components } from '@/api/schema';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef, Button } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { tagLabels } from './ListingCard';

type ListingTag = components['schemas']['ListingTag'];

/** Source order (`allTags`), not `tagLabels` key order. */
const ALL_TAGS: readonly ListingTag[] = ['COMPANY', 'COUPLES', 'FAMILY', 'FRIENDS', 'SOLO'];

export interface TagPickerSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const TagPickerSheet = forwardRef<
  TagPickerSheetRef,
  { selected: ListingTag; onConfirm: (tag: ListingTag) => void }
>(function TagPickerSheet({ selected, onConfirm }, ref) {
  useAppLanguage();
  const { t } = useTranslation();
  const sheetRef = useRef<AppSheetRef>(null);
  const [pending, setPending] = useState<ListingTag>(selected);

  useImperativeHandle(ref, () => ({
    present: () => {
      setPending(selected);
      sheetRef.current?.present();
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  return (
    <AppSheet
      ref={sheetRef}
      snapPoints={[390]}
      stackBehavior="push"
      backgroundColor={colors.background}
    >
      <View style={styles.toolbar}>
        <Button
          variant="toolbarIcon"
          onPress={() => sheetRef.current?.dismiss()}
          accessibilityLabel={t('Cancel')}
          testID="tag-dismiss"
          icon={<Ionicons name="close" size={18} color={colors.contentM} />}
          style={styles.toolbarButton}
        />
        <Text style={styles.toolbarTitle}>{t('Plan for')}</Text>
        <Button
          variant="toolbarIcon"
          onPress={() => {
            sheetRef.current?.dismiss();
            onConfirm(pending);
          }}
          accessibilityLabel={t('Confirm')}
          testID="tag-confirm"
          icon={<Ionicons name="checkmark" size={18} color={colors.white} />}
          style={[styles.toolbarButton, styles.confirmButton]}
        />
      </View>
      <View style={styles.list}>
        {ALL_TAGS.map((tag) => {
          const isSelected = pending === tag;
          return (
            <Pressable
              key={tag}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              testID={`tag-row-${tag}`}
              onPress={() => setPending(tag)}
              style={styles.row}
            >
              <View
                style={[styles.indicator, isSelected ? styles.indicatorOn : styles.indicatorOff]}
              >
                {isSelected ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
              </View>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {t(tagLabels[tag])}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </AppSheet>
  );
});

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  toolbarButton: { width: 43, height: 43, borderRadius: 22, backgroundColor: colors.onSurface },
  confirmButton: { backgroundColor: colors.blueBase },
  toolbarTitle: { ...beVietnamPro(18), color: colors.contentB, letterSpacing: -0.72 },
  list: { paddingHorizontal: spacing.lg, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    padding: 16,
    borderRadius: 19,
    backgroundColor: colors.background,
  },
  indicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginLeft: 2,
    marginRight: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorOn: { backgroundColor: '#0088FF' },
  indicatorOff: { borderWidth: 1.5, borderColor: '#C7C7CC' },
  rowTitle: { ...beVietnamPro(16), color: colors.contentB, letterSpacing: -0.42 },
});
