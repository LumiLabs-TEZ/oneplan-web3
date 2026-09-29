/** `CategoryIconView` port (`CategoryChip.swift:252-274`): 16pt asset, or SF Symbol at 75%. */
import { View } from 'react-native';

import { SFSymbol } from '@/ui/components';
import { colors } from '@/ui/theme';

import { categoryChip } from '../categoryChip';

export interface CategoryChipIconProps {
  category: string | null | undefined;
  size?: number;
  color?: string;
}

export function CategoryChipIcon({
  category,
  size = 16,
  color = colors.contentB,
}: CategoryChipIconProps) {
  const { icon } = categoryChip(category);
  if (icon.type === 'asset') {
    const Icon = icon.Icon;
    return <Icon width={size} height={size} />;
  }
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <SFSymbol
        name={icon.name}
        fallback={icon.fallback}
        size={size * 0.75}
        frame={size}
        weight="600"
        color={color}
      />
    </View>
  );
}
