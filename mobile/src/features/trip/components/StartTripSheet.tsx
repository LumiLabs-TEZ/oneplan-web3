/**
 * "Start your trip now" — port of `Component/BottomSheet/StartTripBottomSheet.swift`
 * (thumbnail + copy + a date field card that opens the calendar + helper texts + primary
 * button). The time-zone row is commented out on iOS too, so it is not ported.
 *
 * The nested picker is the shared `TripDurationSheet`, presented as a second modal on top of
 * this one (`datePickerSheet`, :270-310). `Start trip` stays disabled until a range has been
 * CONFIRMED in that picker (`hasConfirmedTripDateRange`, :63-65).
 */
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMonthDay, parseDateOnly } from '@/features/trip/helpers/dateRange';
import { useAppLanguage } from '@/i18n';
import { svg } from '@/ui/assets';
import { AppSheet, type AppSheetRef, Button, CachedImage } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { TripDurationSheet, type TripDurationSheetRef } from './TripDurationSheet';

const THUMBNAIL_SIZE = 100;

export interface StartTripSheetProps {
  /** `TripDto.startDate` / `endDate` (`yyyy-MM-dd`); both present ⇒ the button starts enabled. */
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  coverImageUrl?: string | null;
  /** The PATCH is in flight (`service.isStartingTrip`). */
  submitting?: boolean;
  onStart: (range: { start: Date; end: Date }) => void;
  /** Injection point for tests. */
  today?: Date;
}

export interface StartTripSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const StartTripSheet = forwardRef<StartTripSheetRef, StartTripSheetProps>(
  function StartTripSheet(
    { startDate, endDate, coverImageUrl, submitting = false, onStart, today },
    ref,
  ) {
    const language = useAppLanguage();
    const { t } = useTranslation();
    const sheetRef = useRef<AppSheetRef>(null);
    const pickerRef = useRef<TripDurationSheetRef>(null);
    const initial = initialRange(startDate, endDate);
    const [confirmed, setConfirmed] = useState<{ start: Date; end: Date } | null>(initial);

    useImperativeHandle(ref, () => ({
      present: () => {
        setConfirmed(initialRange(startDate, endDate));
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const Placeholder = svg.avatarPlaceholder;
    const dateLabel = confirmed
      ? `${formatMonthDay(confirmed.start, language)} – ${formatMonthDay(confirmed.end, language)}`
      : t('Select Date');

    return (
      <>
        <AppSheet ref={sheetRef} snapPoints={[452]}>
          <View style={styles.container}>
            <View style={styles.header}>
              <CachedImage
                uri={coverImageUrl}
                style={styles.thumbnail}
                placeholder={
                  <View style={styles.thumbnailPlaceholder}>
                    <Placeholder width={44} height={44} />
                  </View>
                }
              />
              <View style={styles.headerText}>
                <Text style={styles.title}>{t('Start your trip now')}</Text>
                <Text style={styles.subtitle}>{t('or pick your start date')}</Text>
              </View>
            </View>

            <View style={styles.dateSection}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Trip Dates')}
                testID="start-trip-date-card"
                onPress={() => pickerRef.current?.present()}
                style={styles.card}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="calendar" size={12} color={colors.white} />
                </View>
                <Text style={styles.cardLabel}>{t('Trip Dates')}</Text>
                <View style={styles.cardValueWrap}>
                  <Text style={styles.cardValue} numberOfLines={1}>
                    {dateLabel}
                  </Text>
                  <Ionicons name="chevron-forward" size={11} color={colors.contentM} />
                </View>
              </Pressable>

              <View style={styles.helper}>
                <Text style={styles.helperPrimary}>
                  {t(
                    'After you start your trip, we will send you reminders about what to do and where to go.',
                  )}
                </Text>
                <Text style={styles.helperSecondary}>
                  {t('Note: Your trip must be planned based on the timezone of your destination.')}
                </Text>
              </View>
            </View>

            <Button
              title={t('Start trip')}
              disabled={!confirmed || submitting}
              loading={submitting}
              onPress={() => confirmed && onStart(confirmed)}
              testID="start-trip-button"
            />
          </View>
        </AppSheet>

        <TripDurationSheet
          ref={pickerRef}
          range={confirmed ?? { start: null, end: null }}
          minStart={initial?.start}
          title={t('Select Date')}
          today={today}
          testIDPrefix="start-trip-dates"
          onConfirm={setConfirmed}
        />
      </>
    );
  },
);

function initialRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): { start: Date; end: Date } | null {
  if (!startDate || !endDate) return null;
  return { start: parseDateOnly(startDate), end: parseDateOnly(endDate) };
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, gap: spacing.xxl },
  header: { alignItems: 'center', gap: spacing.xl },
  thumbnail: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, borderRadius: radius.xxl },
  thumbnailPlaceholder: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: radius.xxl,
    backgroundColor: colors.onSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { alignItems: 'center', gap: spacing.sm },
  title: { ...beVietnamPro(20), color: colors.contentB, textAlign: 'center' },
  subtitle: { ...beVietnamPro(14), color: colors.contentM, textAlign: 'center' },
  dateSection: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.background,
  },
  cardIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: colors.purple500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { ...beVietnamPro(14), color: colors.contentB, flex: 1 },
  cardValueWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardValue: { ...beVietnamPro(16, 'medium'), color: colors.contentB },
  helper: { gap: spacing.sm, paddingHorizontal: spacing.sm },
  helperPrimary: { ...beVietnamPro(14), color: colors.neutral950 },
  helperSecondary: { ...beVietnamPro(14), color: colors.neutral400 },
});
