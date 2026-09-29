/**
 * Shared `buildHistorySections` wiring for the two screens that render a trip's history
 * (trip detail and the trip-end recap): accepted members only, trip home currency, current
 * language. Memoised so the grouping does not re-run on every unrelated re-render.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { buildHistorySections, type HistorySection } from '@/features/trip/helpers/historyEntries';
import type { TripDetail } from '@/features/trip/TripDetailContext';
import { useAppLanguage } from '@/i18n';
import type { CurrencyCode } from '@/lib/currency';

export function useHistorySections(
  detail: Pick<TripDetail, 'expenses' | 'budgets' | 'members' | 'homeCurrency'>,
): HistorySection[] {
  const locale = useAppLanguage();
  const { t } = useTranslation();
  const { expenses, budgets, members, homeCurrency } = detail;

  return useMemo(
    () =>
      buildHistorySections({
        expenses,
        budgets,
        members: members.filter((m) => m.inviteStatus === 'ACCEPTED'),
        currency: homeCurrency.code as CurrencyCode,
        now: new Date(),
        t,
        locale,
      }),
    [expenses, budgets, members, homeCurrency.code, t, locale],
  );
}
