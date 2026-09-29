import type { ReactNode, RefObject } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
/** Android implementation is selected by Metro; this branch keeps other platforms free of Skia. */
export function AndroidGlass({
  children,
  style,
}: {
  children?: ReactNode;
  radius: number;
  intensity: number;
  colorScheme?: 'light' | 'dark';
  blurTarget?: RefObject<View | null>;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={style}>{children}</View>;
}
