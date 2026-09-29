/**
 * "N+ added to plan" / "Be the first to add to plan" pill for a location's detail sheet. Port of
 * `LocationDetailView.planCountText` (`ios/OnePlan/OnePlan/View/LocationDetailView.swift:776-786`)
 * — like iOS, nothing renders until the count resolves (or if the lookup fails).
 */
import { useTranslation } from 'react-i18next';

import { useLocationPlanCount } from '@/features/plan/api/queries';
import { useAppLanguage } from '@/i18n';

import { SummaryPill } from './SummaryPill';

export interface PlanCountPillProps {
  location: string;
  testID?: string;
}

export function PlanCountPill({ location, testID }: PlanCountPillProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const { data: count } = useLocationPlanCount(location);

  if (count == null) return null;

  const label =
    count > 0 ? t('%@+ added to plan', { 0: String(count) }) : t('Be the first to add to plan');

  return <SummaryPill title={label} testID={testID} />;
}
