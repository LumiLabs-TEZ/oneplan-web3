/**
 * Day/date chip strip for the create/edit form — port of `PlanFormView.scopeRow`
 * (`ios/OnePlan/OnePlan/View/Plan/PlanFormView.swift:217-297`). Distinct from the Plan tab's
 * `DayChipStrip`: long press is 100ms (vs 450ms) and immediately confirms deletion through an
 * `Alert` rather than opening a rearrange sheet.
 */
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { dayChipLabel, type DayContext } from '../helpers/planDays';

export interface PlanFormDayChipsProps {
  ctx: DayContext;
  days: readonly number[];
  selected: number;
  onSelect: (day: number) => void;
  /** Omit to hide the trailing "+ add" chip. */
  onAddDay?: () => void;
  /** Omit to disable long-press delete. Only offered while more than one day exists. */
  onDeleteDay?: (day: number) => void;
  canAddDay: boolean;
  locale: 'en' | 'vi';
}

const LONG_PRESS_MS = 100;

export function PlanFormDayChips({
  ctx,
  days,
  selected,
  onSelect,
  onAddDay,
  onDeleteDay,
  canAddDay,
  locale,
}: PlanFormDayChipsProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const confirmDelete = (day: number) => {
    if (!onDeleteDay || days.length <= 1) return;
    Alert.alert(
      t('Delete Day %lld?', { 0: day }),
      t('All plans on Day %lld will be deleted. Plans on later days will be moved up.', { 0: day }),
      [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Delete'), style: 'destructive', onPress: () => onDeleteDay(day) },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{t('Day')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="plan-form-day-chips">
        <View style={styles.row}>
          {days.map((day) => {
            const { dateLabel, dayNumber } = dayChipLabel(ctx, day, locale);
            const isSelected = selected === day;
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelect(day)}
                onLongPress={() => confirmDelete(day)}
                delayLongPress={LONG_PRESS_MS}
                style={[styles.chip, isSelected && styles.chipSelected]}
                testID={`plan-form-day-chip-${day}`}
              >
                {dateLabel ? (
                  <Text
                    style={[styles.dateLabel, isSelected && styles.dateLabelSelected]}
                    numberOfLines={1}
                  >
                    {dateLabel}
                  </Text>
                ) : null}
                {/* Semibold only beside a date label; a bare "Day N" is medium (iOS `dayChip`). */}
                <Text
                  style={[
                    dateLabel ? styles.dayLabel : styles.dayLabelNoDate,
                    isSelected && styles.dayLabelSelected,
                  ]}
                  numberOfLines={1}
                >
                  {t('Day %lld', { 0: dayNumber })}
                </Text>
              </Pressable>
            );
          })}

          {canAddDay && onAddDay ? (
            <Pressable
              accessibilityRole="button"
              onPress={onAddDay}
              style={styles.addChip}
              testID="plan-form-add-day-chip"
            >
              <Text style={styles.addLabel}>{t('+ add')}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  label: { ...beVietnamPro(14), color: colors.contentM, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 1 },
  chip: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chipSelected: { backgroundColor: colors.blueBase },
  dateLabel: { ...beVietnamPro(13, 'medium'), color: colors.contentM },
  dateLabelSelected: { color: 'rgba(255,255,255,0.75)' },
  dayLabel: { ...beVietnamPro(15, 'semibold'), color: colors.contentB },
  dayLabelNoDate: { ...beVietnamPro(15, 'medium'), color: colors.contentB },
  dayLabelSelected: { color: colors.white },
  addChip: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  addLabel: { ...beVietnamPro(15, 'medium'), color: colors.contentB },
});
