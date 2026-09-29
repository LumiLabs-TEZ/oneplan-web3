import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/ui/theme';

export interface ScreenContainerProps {
  children?: ReactNode;
  edges?: readonly Edge[];
  /** Adds `spacing.lg` horizontal padding. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ScreenContainer({
  children,
  edges = ['top'],
  padded = false,
  style,
}: ScreenContainerProps) {
  return (
    <SafeAreaView edges={edges} style={[styles.root, padded && styles.padded, style]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  padded: { paddingHorizontal: spacing.lg },
});
