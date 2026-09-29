/**
 * Settings row/section icon — port of `SettingView.settingIcon` + the SF Symbol headers.
 * Colored rows use the `settingIcon` asset SVGs; SF Symbol rows render the real symbol on iOS
 * (`SFSymbol`) and an Ionicons fallback elsewhere.
 */
import { Ionicons } from '@expo/vector-icons';

import type { SettingIconSpec } from '@/features/settings/helpers/sections';
import { svg } from '@/ui/assets';
import { SFSymbol } from '@/ui/components/SFSymbol';

export interface SettingIconProps {
  icon: SettingIconSpec;
  size: number;
  color: string;
}

export function SettingIcon({ icon, size, color }: SettingIconProps) {
  if (typeof icon === 'string') return <Ionicons name={icon} size={size} color={color} />;
  if ('asset' in icon) {
    const Asset = svg.settings[icon.asset];
    return <Asset width={size} height={size} />;
  }
  return (
    <SFSymbol
      name={icon.sf}
      fallback={icon.ionicon}
      size={icon.symbolSize ?? size}
      frame={size}
      color={color}
    />
  );
}
