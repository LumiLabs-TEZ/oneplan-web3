/**
 * "Choose trip dates" — port of `Component/BottomSheet/TripDatesBottomSheet.swift`.
 *
 * Deliberately a thin adapter over the shared `TripDurationSheet`: the iOS sheet is the very
 * same calendar as `TripDurationBottomSheet` with a title and a raised floor. All this layer
 * adds is the DTO↔Date mapping (`yyyy-MM-dd` strings in, `Date`s out) and the
 * `minStart = max(trip.startDate, today)` rule.
 */
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

import { parseDateOnly } from '@/features/trip/helpers/dateRange';
import { useAppLanguage } from '@/i18n';

import { TripDurationSheet, type TripDurationSheetRef } from './TripDurationSheet';

export type TripDatesSheetRef = TripDurationSheetRef;

export interface TripDatesSheetProps {
  /** `TripDto.startDate` (`yyyy-MM-dd`) — both the primed selection and the floor. */
  startDate: string | null | undefined;
  /** `TripDto.endDate` (`yyyy-MM-dd`). */
  endDate: string | null | undefined;
  onConfirm: (range: { start: Date; end: Date }) => void;
  /** Injection point for tests. */
  today?: Date;
}

export const TripDatesSheet = forwardRef<TripDatesSheetRef, TripDatesSheetProps>(
  function TripDatesSheet({ startDate, endDate, onConfirm, today }, ref) {
    useAppLanguage();
    const { t } = useTranslation();
    const start = startDate ? parseDateOnly(startDate) : null;
    const end = endDate ? parseDateOnly(endDate) : null;

    return (
      <TripDurationSheet
        ref={ref}
        range={{ start, end }}
        minStart={start ?? undefined}
        title={t('Choose trip dates')}
        onConfirm={onConfirm}
        today={today}
        testIDPrefix="trip-dates"
      />
    );
  },
);
