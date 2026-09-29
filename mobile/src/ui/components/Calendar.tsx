/**
 * Port of `Component/Common/MultiSelectCalendar.swift`: a single-month grid
 * with range selection. Sunday-first weeks (`buildMonthGrid`), locale-aware
 * month title + weekday symbols via `Intl`. Text color precedence (:200-214):
 * in-range/today → invertedText, disabled → disabled, weekend → secondary,
 * else primaryText. Range background shapes (:286-330): single → full circle,
 * start → circle + right-half band, middle → full-width band, end → circle +
 * left-half band.
 */
import { StyleSheet, Pressable, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { buildMonthGrid, startOfDay, toDateOnly, type DateRange } from '@/features/trip/helpers/dateRange';

/** Raw color literals ported from `CalendarStyle` — deliberately not the
 * shared design tokens, since this is a 1:1 port of iOS calendar colors. */
const CALENDAR_COLORS = {
  primary: '#007AFF',
  secondary: 'rgb(255, 38, 28)',
  primaryText: 'rgb(43, 43, 43)',
  invertedText: 'rgb(245, 245, 245)',
  neutral: 'rgb(138, 138, 138)',
  disabled: 'rgb(227, 227, 227)',
};

const ROW_HEIGHT = 48;
export const CALENDAR_MONTH_HEIGHT = 416;

type RangePosition = 'single' | 'start' | 'middle' | 'end' | null;

export interface CalendarProps {
  year: number;
  month0: number;
  range: DateRange;
  minDate: Date;
  today: Date;
  onTap: (date: Date) => void;
}

export function Calendar({ year, month0, range, minDate, today, onTap }: CalendarProps) {
  const language = useAppLanguage();
  const monthStart = new Date(year, month0, 1);
  const monthTitle = monthTitleFormatter(language).format(monthStart);
  const weeks = buildMonthGrid(year, month0);
  const min = startOfDay(minDate);
  const todayStart = startOfDay(today);
  const normalized = normalizeForDisplay(range);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerText} numberOfLines={1}>
          {monthTitle}
        </Text>
        <Text style={styles.headerText} numberOfLines={1}>
          {year}
        </Text>
      </View>
      <View style={styles.weekRow}>
        {weekdaySymbols(language).map((symbol, index) => (
          <Text
            key={symbol + index}
            style={[
              styles.weekdayText,
              { color: index === 0 || index === 6 ? CALENDAR_COLORS.primary : CALENDAR_COLORS.neutral },
            ]}
          >
            {symbol}
          </Text>
        ))}
      </View>
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((date, dayIndex) =>
            date ? (
              <DayCell
                key={toDateOnly(date)}
                date={date}
                disabled={date.getTime() < min.getTime()}
                isToday={date.getTime() === todayStart.getTime()}
                position={positionFor(date, normalized)}
                onTap={onTap}
              />
            ) : (
              <View key={`blank-${weekIndex}-${dayIndex}`} style={styles.dayCellWrap} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

interface DayCellProps {
  date: Date;
  disabled: boolean;
  isToday: boolean;
  position: RangePosition;
  onTap: (date: Date) => void;
}

function DayCell({ date, disabled, isToday, position, onTap }: DayCellProps) {
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const inRange = position !== null;
  const textColor = inRange || isToday
    ? CALENDAR_COLORS.invertedText
    : disabled
      ? CALENDAR_COLORS.disabled
      : isWeekend
        ? CALENDAR_COLORS.secondary
        : CALENDAR_COLORS.primaryText;

  return (
    <View style={styles.dayCellWrap}>
      <RangeBackground position={position} isToday={isToday} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onTap(date)}
        style={styles.dayCellPressable}
        testID={`calendar-day-${toDateOnly(date)}`}
      >
        <Text style={[styles.dayText, { color: textColor }]}>{date.getDate()}</Text>
      </Pressable>
    </View>
  );
}

function RangeBackground({ position, isToday }: { position: RangePosition; isToday: boolean }) {
  if (!position) {
    if (isToday) return <View style={styles.todayCircle} />;
    return null;
  }
  if (position === 'single') return <View style={styles.rangeCircle} />;
  if (position === 'middle') return <View style={styles.rangeBand} />;
  if (position === 'start') {
    return (
      <>
        <View style={[styles.rangeBand, styles.rangeBandRightHalf]} />
        <View style={styles.rangeCircle} />
      </>
    );
  }
  return (
    <>
      <View style={[styles.rangeBand, styles.rangeBandLeftHalf]} />
      <View style={styles.rangeCircle} />
    </>
  );
}

/** Shared "no selection" range — see `rangeInMonth`. */
export const EMPTY_RANGE: DateRange = Object.freeze({ start: null, end: null });

/**
 * `range` when any of it falls inside the given month, else the shared `EMPTY_RANGE`. A month
 * the selection doesn't touch then gets the same `range` prop on every tap, so its (compiled)
 * grid is reused instead of rebuilt. Draws identically: `EMPTY_RANGE` highlights nothing, just
 * like a range that misses the month.
 */
export function rangeInMonth(range: DateRange, year: number, month0: number): DateRange {
  const normalized = normalizeForDisplay(range);
  if (!normalized) return EMPTY_RANGE;
  const monthStart = new Date(year, month0, 1).getTime();
  const nextMonthStart = new Date(year, month0 + 1, 1).getTime();
  return normalized.start.getTime() < nextMonthStart && normalized.end.getTime() >= monthStart
    ? range
    : EMPTY_RANGE;
}

function normalizeForDisplay(range: DateRange): { start: Date; end: Date } | null {
  if (!range.start) return null;
  const start = startOfDay(range.start);
  const end = startOfDay(range.end ?? range.start);
  return start.getTime() <= end.getTime() ? { start, end } : { start: end, end: start };
}

function positionFor(date: Date, normalized: { start: Date; end: Date } | null): RangePosition {
  if (!normalized) return null;
  const t = startOfDay(date).getTime();
  const startT = normalized.start.getTime();
  const endT = normalized.end.getTime();
  if (t < startT || t > endT) return null;
  const isStart = t === startT;
  const isEnd = t === endT;
  if (isStart && isEnd) return 'single';
  if (isStart) return 'start';
  if (isEnd) return 'end';
  return 'middle';
}

// `Intl` formatters are costly to build; each of the 12 months would otherwise make its own on
// every render. One per app language, built on first use.
const monthTitleFormatters = new Map<string, Intl.DateTimeFormat>();
const weekdaySymbolsByLocale = new Map<string, readonly string[]>();

function monthTitleFormatter(locale: 'en' | 'vi'): Intl.DateTimeFormat {
  let formatter = monthTitleFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { month: 'long' });
    monthTitleFormatters.set(locale, formatter);
  }
  return formatter;
}

/** Locale-aware very-short weekday symbols, Sunday-first (Jan 4 1970 was a Sunday). */
function weekdaySymbols(locale: 'en' | 'vi'): readonly string[] {
  let symbols = weekdaySymbolsByLocale.get(locale);
  if (!symbols) {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    symbols = Array.from({ length: 7 }, (_, i) => formatter.format(new Date(1970, 0, 4 + i)));
    weekdaySymbolsByLocale.set(locale, symbols);
  }
  return symbols;
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: ROW_HEIGHT,
    paddingHorizontal: 20,
  },
  headerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: CALENDAR_COLORS.primaryText,
  },
  weekRow: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
  },
  weekdayText: {
    flex: 1,
    height: ROW_HEIGHT,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 18,
    fontWeight: 'bold',
  },
  dayCellWrap: {
    flex: 1,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellPressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 18,
    fontWeight: 'normal',
  },
  rangeCircle: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    right: 4,
    borderRadius: 999,
    backgroundColor: CALENDAR_COLORS.primary,
  },
  rangeBand: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    right: 0,
    backgroundColor: CALENDAR_COLORS.primary,
  },
  rangeBandRightHalf: { left: '50%' },
  rangeBandLeftHalf: { right: '50%' },
  todayCircle: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 3,
    right: 3,
    borderRadius: 999,
    backgroundColor: CALENDAR_COLORS.secondary,
  },
});
