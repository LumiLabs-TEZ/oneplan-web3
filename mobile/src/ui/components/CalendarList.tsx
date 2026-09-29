/**
 * 12-month vertical list of `Calendar`s, starting at `minDate`'s month — the
 * earliest selectable day, which is `today` unless the caller raised the floor
 * (`TripDatesBottomSheet.displayedMonths`, built from `minimumAllowedStartDate`).
 * Defaults to `FlatList`; accepts `ListComponent` so a `@gorhom/bottom-sheet`
 * sheet can pass `BottomSheetFlatList` instead. Each month only sees the selection when the
 * selection touches it (`rangeInMonth`), so a tap re-draws just the affected months — this relies
 * on `minDate`, `today` and `onTap` staying referentially stable across taps (callers keep them
 * in state / let the compiler memoise them).
 */
import { useMemo, type ComponentType } from 'react';
import { FlatList, StyleSheet, View, type FlatListProps, type StyleProp, type ViewStyle } from 'react-native';

import { monthsFrom, type DateRange } from '@/features/trip/helpers/dateRange';

import { Calendar, CALENDAR_MONTH_HEIGHT, rangeInMonth } from './Calendar';

type Month = { year: number; month0: number };

export interface CalendarListProps {
  range: DateRange;
  minDate: Date;
  today: Date;
  onTap: (date: Date) => void;
  monthCount?: number;
  /** Defaults to `FlatList`; pass `BottomSheetFlatList` inside an `AppSheet`. */
  ListComponent?: ComponentType<FlatListProps<Month>>;
  style?: StyleProp<ViewStyle>;
}

export function CalendarList({
  range,
  minDate,
  today,
  onTap,
  monthCount = 12,
  ListComponent,
  style,
}: CalendarListProps) {
  const months = useMemo(() => monthsFrom(minDate, monthCount), [minDate, monthCount]);
  const List = (ListComponent ?? FlatList) as ComponentType<FlatListProps<Month>>;

  return (
    <List
      data={months}
      keyExtractor={(month) => `${month.year}-${month.month0}`}
      renderItem={({ item }) => (
        <View style={styles.monthWrap}>
          <Calendar
            year={item.year}
            month0={item.month0}
            range={rangeInMonth(range, item.year, item.month0)}
            minDate={minDate}
            today={today}
            onTap={onTap}
          />
        </View>
      )}
      getItemLayout={(_, index) => ({
        length: CALENDAR_MONTH_HEIGHT,
        offset: CALENDAR_MONTH_HEIGHT * index,
        index,
      })}
      style={style}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  monthWrap: { height: CALENDAR_MONTH_HEIGHT },
});
