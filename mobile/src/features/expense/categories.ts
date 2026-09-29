/**
 * Expense categories — port of `ios/OnePlan/OnePlan/Model/ExpenseCategoryOption.swift`.
 * Order matches the iOS picker. `title` is an i18n key. Legacy iOS case names map to the
 * server enum (`restaurant→FOOD`, `hotel→STAY`, `museum→TICKET`, `airport→TRANSPORT`,
 * `others→OTHER`); icons come from the shared `poiIllustration` set.
 */
import type { components } from '@/api/schema';
import { svg } from '@/ui/assets';
import { colors } from '@/ui/theme';

export type ExpenseCategory = components['schemas']['ExpenseCategory'];

export interface ExpenseCategoryOption {
  value: ExpenseCategory;
  title: string;
  Icon: (typeof svg.categories)[ExpenseCategory];
  /** Marker/chip colour — port of `CategoryChip.Category.selectedBackgroundColor`
   * (`ios/OnePlan/OnePlan/Component/.../CategoryChip.swift:115-129`). The palette has far
   * fewer tokens than categories, so several categories share a colour by family. */
  color: string;
}

export const EXPENSE_CATEGORIES: readonly ExpenseCategoryOption[] = [
  { value: 'FOOD', title: 'Restaurant', Icon: svg.categories.FOOD, color: colors.warning500 },
  {
    value: 'STAY',
    title: 'Hotel / Accommodation',
    Icon: svg.categories.STAY,
    color: colors.green500,
  },
  { value: 'TICKET', title: 'Museum', Icon: svg.categories.TICKET, color: colors.blueBase },
  { value: 'TRANSPORT', title: 'Airport', Icon: svg.categories.TRANSPORT, color: colors.purple500 },
  { value: 'COFFEE', title: 'Coffee', Icon: svg.categories.COFFEE, color: colors.warning500 },
  { value: 'SPA', title: 'Spa / Healing', Icon: svg.categories.SPA, color: colors.green500 },
  { value: 'GYM', title: 'Gym', Icon: svg.categories.GYM, color: colors.green500 },
  {
    value: 'NIGHT_CLUB',
    title: 'Night club',
    Icon: svg.categories.NIGHT_CLUB,
    color: colors.purple500,
  },
  { value: 'GROCERY', title: 'Grocery', Icon: svg.categories.GROCERY, color: colors.warning500 },
  {
    value: 'SHOPPING',
    title: 'Shopping/ Mall',
    Icon: svg.categories.SHOPPING,
    color: colors.neutral600,
  },
  { value: 'CINEMA', title: 'Cinema', Icon: svg.categories.CINEMA, color: colors.blueBase },
  { value: 'PHARMACY', title: 'Pharmacy', Icon: svg.categories.PHARMACY, color: colors.neutral600 },
  { value: 'PARK', title: 'Park', Icon: svg.categories.PARK, color: colors.green500 },
  { value: 'OTHER', title: 'Others', Icon: svg.categories.OTHER, color: colors.neutral600 },
];

const OTHER = EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]!;

/** Unknown / missing values fall back to OTHER (iOS `init?(apiValue:)` → `.others`). */
export function categoryOption(value: string | null | undefined): ExpenseCategoryOption {
  return EXPENSE_CATEGORIES.find((c) => c.value === value) ?? OTHER;
}
