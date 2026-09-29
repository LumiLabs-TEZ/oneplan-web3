/**
 * Port of `ios/OnePlan/OnePlan/Component/Vault/CategoryIcon.swift` — draws a category using the
 * illustration the design ships for it, falling back to an emoji for the two it doesn't
 * (`park`, `other`: the mockup's last rows sit outside the sheet, so Figma renders one clipped
 * and one blank).
 *
 * The vault's per-category PNGs (`catFood.png`, `catCoffee.png`, …) were pixel-identical artwork
 * to the illustrations already wired in `@/ui/assets` `svg.categories` for the classic expense
 * flow, so this component reuses `svg.categories` directly and the duplicate PNGs were deleted
 * (final-review M9).
 */
import { Text, View } from 'react-native';

import type { ExpenseCategory } from '@/features/expense/categories';
import { svg } from '@/ui/assets';

/** `CategoryChip.Category.iconAsset` empty ⇒ `.emoji` fallback (Swift, unchanged here). */
const NO_ILLUSTRATION: ReadonlySet<ExpenseCategory> = new Set(['PARK', 'OTHER']);

/** `CategoryChip.Category.emoji`, for the categories with no illustration yet. */
const EMOJI: Partial<Record<ExpenseCategory, string>> = {
  PARK: '🌵',
  OTHER: '🧾',
};

export interface CategoryIconProps {
  category: ExpenseCategory;
  size?: number;
}

export function CategoryIcon({ category, size = 43 }: CategoryIconProps) {
  if (NO_ILLUSTRATION.has(category)) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.62 }}>{EMOJI[category] ?? '🧾'}</Text>
      </View>
    );
  }
  const Icon = svg.categories[category];
  return <Icon width={size} height={size} preserveAspectRatio="xMidYMid meet" />;
}
