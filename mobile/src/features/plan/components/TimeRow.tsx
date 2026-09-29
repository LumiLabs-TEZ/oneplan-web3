/**
 * Time-of-day row + picker — port of `PlanFormView.timeRow`/`.timePickerSheet`
 * (`ios/OnePlan/OnePlan/View/Plan/PlanFormView.swift:310-322`). iOS opens an `AppSheet` with a
 * spinner-style `DateTimePicker`; Android uses the OS's own imperative dialog
 * (`DateTimePickerAndroid.open`) so there's no sheet to render there.
 */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { deviceUses24hourClock, displayLocale, useAppLanguage } from '@/i18n';
import { AppSheet, Button, type AppSheetRef } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { formatPlanTime } from '../helpers/timeLabel';

export interface TimeRowProps {
  hour: number;
  minute: number;
  onChange: (time: { hour: number; minute: number }) => void;
  testID?: string;
}

function timeToDate(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

export const TimeRow = forwardRef<{ open: () => void }, TimeRowProps>(function TimeRow(
  { hour, minute, onChange, testID },
  ref,
) {
  const language = useAppLanguage();
  const { t } = useTranslation();
  const sheetRef = useRef<AppSheetRef>(null);
  const [draft, setDraft] = useState(() => timeToDate(hour, minute));

  const open = () => {
    const value = timeToDate(hour, minute);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        onChange: (_event, date) => {
          if (date) onChange({ hour: date.getHours(), minute: date.getMinutes() });
        },
      });
      return;
    }
    setDraft(value);
    sheetRef.current?.present();
  };

  useImperativeHandle(ref, () => ({ open }));

  const done = () => {
    onChange({ hour: draft.getHours(), minute: draft.getMinutes() });
    sheetRef.current?.dismiss();
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={open}
        style={styles.row}
        testID={testID ?? 'plan-time-row'}
      >
        <Text style={styles.label}>{t('Time')}</Text>
        <Text style={styles.value}>
          {formatPlanTime(hour, minute, displayLocale(language), deviceUses24hourClock())}
        </Text>
      </Pressable>

      {Platform.OS !== 'android' ? (
        <AppSheet
          ref={sheetRef}
          snapPoints={[320]}
          footer={<Button title={t('Done')} onPress={done} testID="plan-time-done" />}
        >
          <DateTimePicker
            mode="time"
            display="spinner"
            value={draft}
            onChange={(_event, date) => {
              if (date) setDraft(date);
            }}
          />
        </AppSheet>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  // `PlanFormInfoRow` (`PlanFormView.swift:792-819`): white 48pt card, radius 20.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.white,
  },
  label: { ...beVietnamPro(14), color: colors.contentM },
  value: { ...beVietnamPro(16), color: colors.contentB },
});
