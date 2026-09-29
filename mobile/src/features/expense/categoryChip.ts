/**
 * Port of `CategoryChip.Category` `iconSource` + `title`
 * (`ios/OnePlan/OnePlan/Component/Chip/CategoryChip.swift:46-110`) — the compact glyph + short
 * name ("Food", "Stay", …) iOS shows in chips and the expense-detail Category row. Distinct from
 * `categories.ts`, whose illustrations and long titles ("Restaurant") back the category picker.
 */
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import type { components } from '@/api/schema';
import { svg } from '@/ui/assets';

type ExpenseCategory = components['schemas']['ExpenseCategory'];

export type CategoryChipIconSource =
  | { type: 'asset'; Icon: (typeof svg.categoryChip)[keyof typeof svg.categoryChip] }
  | { type: 'symbol'; name: string; fallback: ComponentProps<typeof Ionicons>['name'] };

export interface CategoryChipInfo {
  /** i18n key. */
  title: string;
  icon: CategoryChipIconSource;
}

const symbol = (
  name: string,
  fallback: ComponentProps<typeof Ionicons>['name'],
): CategoryChipIconSource => ({ type: 'symbol', name, fallback });

export const CATEGORY_CHIPS = {
  FOOD: { title: 'Food', icon: { type: 'asset', Icon: svg.categoryChip.food } },
  STAY: { title: 'Stay', icon: { type: 'asset', Icon: svg.categoryChip.building } },
  TICKET: { title: 'Ticket', icon: { type: 'asset', Icon: svg.categoryChip.ticket } },
  TRANSPORT: { title: 'Transport', icon: { type: 'asset', Icon: svg.categoryChip.plane } },
  OTHER: { title: 'Other', icon: symbol('ellipsis', 'ellipsis-horizontal') },
  COFFEE: { title: 'Coffee', icon: symbol('cup.and.saucer.fill', 'cafe') },
  SPA: { title: 'Spa', icon: symbol('leaf.fill', 'leaf') },
  GYM: { title: 'Gym', icon: symbol('dumbbell.fill', 'barbell') },
  NIGHT_CLUB: { title: 'Night club', icon: symbol('music.note', 'musical-note') },
  GROCERY: { title: 'Grocery', icon: symbol('basket.fill', 'basket') },
  SHOPPING: { title: 'Shopping', icon: symbol('bag.fill', 'bag') },
  CINEMA: { title: 'Cinema', icon: symbol('film.fill', 'film') },
  PHARMACY: { title: 'Pharmacy', icon: symbol('cross.case.fill', 'medkit') },
  PARK: { title: 'Park', icon: symbol('tree.fill', 'leaf') },
} as const satisfies Record<ExpenseCategory, CategoryChipInfo>;

/** Unknown / missing values fall back to OTHER (iOS `init?(apiValue:) ?? .other`). */
export function categoryChip(value: string | null | undefined): CategoryChipInfo {
  return (CATEGORY_CHIPS as Record<string, CategoryChipInfo>)[value ?? ''] ?? CATEGORY_CHIPS.OTHER;
}
