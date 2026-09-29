/**
 * Home "Today's activities" — thin wrapper around `PlanRouteMapCard`: converts
 * today's plan items into `DayPin`s + a merged driving route, then delegates
 * all rendering to the shared route-map card. Pin/"View details" taps push
 * the full-screen day map (`plan/day-map`) with today's date
 * (`Component/Home/TodaysActivitiesCard.swift` → `PlanDayMapView`).
 */
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { StyleProp, ViewStyle } from 'react-native';

import type { components } from '@/api/schema';
import { dayMapPins } from '@/features/plan/helpers/planDays';
import { PlanRouteMapCard } from '@/features/plan/components/PlanRouteMapCard';
import { useDayRoute } from '@/features/plan/hooks/useDayRoute';
import { useAppLanguage } from '@/i18n';

type PlanItemDto = components['schemas']['PlanItemDto'];

export interface TodaysActivityPin {
  /** 1-based position in today's timeline (`PlanDayPin.index`). */
  index: number;
  item: PlanItemDto;
}

export interface TodaysActivitiesCardProps {
  pins: readonly TodaysActivityPin[];
  tripId: number;
  /** `yyyy-MM-dd`, today's date in the device's local zone (`localDateString`). */
  date: string;
  style?: StyleProp<ViewStyle>;
}

export function TodaysActivitiesCard({ pins, tripId, date, style }: TodaysActivitiesCardProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const dayPins = dayMapPins(pins.map((p) => p.item));
  const route = useDayRoute(tripId, dayPins, { date });

  if (dayPins.length === 0) return null;

  const goToDayMap = () =>
    router.push({
      pathname: '/trip/[tripId]/plan/day-map',
      params: { tripId: String(tripId), date },
    });

  return (
    <PlanRouteMapCard
      title={t('Today’s activities')}
      pins={route.pins}
      legs={route.legs}
      onViewDetails={goToDayMap}
      onPinPress={goToDayMap}
      style={style}
      testID="todays-activities-card"
    />
  );
}
