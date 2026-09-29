/**
 * Shared trip range picker — port of `Component/BottomSheet/TripDurationBottomSheet.swift`
 * and, via `minStart` + `title`, of `TripDatesBottomSheet.swift` and `StartTripBottomSheet`'s
 * nested date sheet (all three are the same calendar with a different floor and header).
 *
 * Local draft range primed from the caller's current range clamped to the earliest selectable
 * day (`resetDraftSelection`, :134-137 / `primeDraftSelection`, :109-122); day taps go through
 * `applyRangeTap` (`handleDateSelection`, :105-122); `Confirm` normalizes the draft and reports
 * it back (`confirmSelection`, :124-132).
 */
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  applyRangeTap,
  clampRange,
  normalizeRange,
  startOfDay,
  type DateRange,
} from '@/features/trip/helpers/dateRange';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef, Button, CalendarList } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface TripDurationSheetProps {
  /** Current confirmed range from the caller — primed as the draft on each `present()`. */
  range: DateRange;
  onConfirm: (range: { start: Date; end: Date }) => void;
  /** Injection point for tests; defaults to `new Date()` on each present. */
  today?: Date;
  /**
   * Earliest selectable day (`minimumStartDate`). Raised to `today` when it is in the past —
   * a trip can never be (re)scheduled to start before today.
   */
  minStart?: Date;
  /** Optional sheet header (`TripDatesBottomSheet` shows "Choose trip dates"). */
  title?: string;
  /**
   * Namespaces this picker's testIDs (`{prefix}-sheet`, `{prefix}-confirm`) so a screen that
   * mounts two pickers at once — the trip-dates one and the one nested in `StartTripSheet` —
   * can target each unambiguously.
   */
  testIDPrefix?: string;
}

export interface TripDurationSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const TripDurationSheet = forwardRef<TripDurationSheetRef, TripDurationSheetProps>(
  function TripDurationSheet(
    { range, onConfirm, today, minStart, title, testIDPrefix = 'duration' },
    ref,
  ) {
    useAppLanguage();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<AppSheetRef>(null);
    const [draft, setDraft] = useState<DateRange>(range);
    const [anchorToday, setAnchorToday] = useState<Date>(today ?? new Date());
    const [minDate, setMinDate] = useState<Date>(() => earliestDay(today ?? new Date(), minStart));

    useImperativeHandle(ref, () => ({
      present: () => {
        const now = today ?? new Date();
        const floor = earliestDay(now, minStart);
        setAnchorToday(now);
        setMinDate(floor);
        setDraft(clampRange(range, floor));
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const confirmable = draft.start !== null;

    const handleConfirm = () => {
      const normalized = normalizeRange(draft);
      if (!normalized) return;
      onConfirm(normalized);
      sheetRef.current?.dismiss();
    };

    return (
      <AppSheet
        ref={sheetRef}
        snapPoints={['92%']}
        footer={
          // The sheet is edge-attached, so clear the home indicator / Android nav bar.
          <View style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}>
            <Button
              title={t('Confirm')}
              disabled={!confirmable}
              onPress={handleConfirm}
              testID={`${testIDPrefix}-confirm`}
            />
          </View>
        }
      >
        <View style={styles.container} testID={`${testIDPrefix}-sheet`}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <CalendarList
            range={draft}
            minDate={minDate}
            today={anchorToday}
            onTap={(date) => setDraft((prev) => applyRangeTap(prev, date, minDate))}
            ListComponent={BottomSheetFlatList}
            style={styles.list}
          />
        </View>
      </AppSheet>
    );
  },
);

/** `max(today, minStart)` at local start-of-day (`minimumAllowedStartDate`). */
function earliestDay(today: Date, minStart: Date | undefined): Date {
  const todayStart = startOfDay(today);
  if (!minStart) return todayStart;
  const floor = startOfDay(minStart);
  return floor.getTime() > todayStart.getTime() ? floor : todayStart;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: {
    ...beVietnamPro(16, 'medium'),
    color: colors.contentB,
    textAlign: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  list: { flex: 1 },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
