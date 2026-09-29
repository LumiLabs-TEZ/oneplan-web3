import { StyleSheet, View } from 'react-native';

import { svg } from '@/ui/assets';
import { colors } from '@/ui/theme';

export interface OnePlanProLogoBadgeProps {
  size?: number;
  showsShadow?: boolean;
}

/** Port of `OnePlanProLogoBadge.swift`: white tile, black inset tile, `onePlanPro` logo. */
export function OnePlanProLogoBadge({ size = 32, showsShadow = true }: OnePlanProLogoBadgeProps) {
  const Logo = svg.illustration.onePlanPro;
  const s = size / 32;
  const padding = 3 * s;
  const inner = size - 2 * padding;
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: 10 * s },
        showsShadow && { boxShadow: `${-0.7 * s}px ${2.8 * s}px ${9 * s}px rgba(0,0,0,0.34)` },
      ]}
    >
      <View
        style={[
          styles.inner,
          { top: padding, left: padding, right: padding, bottom: padding, borderRadius: 7 * s },
        ]}
      />
      <Logo
        width={inner}
        height={inner}
        style={{ position: 'absolute', top: padding, left: padding }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.white },
  inner: { position: 'absolute', backgroundColor: colors.black },
});
