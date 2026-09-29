/**
 * Pure form rules of `RequestTripBottomSheet.swift` + `MainView.submitTripRequest`.
 */
import type { components } from '@/api/schema';

type CreateTripRequestDto = components['schemas']['CreateTripRequestDto'];
type LocationSearchResultDto = components['schemas']['LocationSearchResultDto'];

export const PARTICIPANT_RANGE = { min: 1, max: 50 } as const;
export const DAY_RANGE = { min: 1, max: 30 } as const;

export interface RequestPlanForm {
  destination: LocationSearchResultDto | null;
  tag: components['schemas']['ListingTag'];
  currency: components['schemas']['Currency'];
  budgetText: string;
  participantCount: number;
  dayCount: number;
  description: string;
}

export const DEFAULT_REQUEST_PLAN_FORM: RequestPlanForm = {
  destination: null,
  tag: 'FRIENDS',
  currency: 'VND',
  budgetText: '',
  participantCount: 2,
  dayCount: 3,
  description: '',
};

/** 15 digits stay exact as a JS number (UInt64 on iOS; nobody budgets past 10^15). */
const MAX_BUDGET_DIGITS = 15;

function budgetDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, MAX_BUDGET_DIGITS);
}

/**
 * `RequestPlanBudgetRow.formatBudget`: drop every non-digit, then regroup in the device locale
 * with no fraction digits — "2500000" → "2,500,000". Empty input stays empty.
 */
export function formatBudget(raw: string): string {
  const digits = budgetDigits(raw);
  if (!digits) return '';
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(Number(digits));
}

/** Request body, or `null` when no destination is picked ("Destination required"). */
export function toCreateTripRequest(form: RequestPlanForm): CreateTripRequestDto | null {
  if (!form.destination) return null;
  const digits = budgetDigits(form.budgetText);
  const description = form.description.trim();
  return {
    countryId: form.destination.country.id,
    stateId: form.destination.state.id,
    ...(form.destination.city ? { cityId: form.destination.city.id } : {}),
    tag: form.tag,
    currency: form.currency,
    participantCount: form.participantCount,
    dayCount: form.dayCount,
    ...(digits ? { budget: Number(digits) } : {}),
    ...(description ? { description } : {}),
  };
}
