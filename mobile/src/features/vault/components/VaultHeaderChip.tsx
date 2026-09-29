/**
 * Port of `ios/OnePlan/OnePlan/Component/Vault/VaultHeaderChip.swift` — the pill treatment the
 * vault screens share for their header controls (back arrow, "Back" label, balance chip).
 *
 * Two variants, because the same chip sits on two very different backdrops. On a page it is a
 * flat fill (`VaultPalette.headerChip`) plus a soft shadow — a translucent material there would
 * pick up the page background and read as wrong. Over a camera feed (`overCamera`) it has to be
 * translucent instead, or it becomes a white block punched out of the picture; iOS also flips
 * the environment colour scheme to dark there so the chip's own content renders light — RN has
 * no such propagation, so a caller passing `overCamera` must give its children light colours
 * itself (the only current consumer, `VaultScanQRView`, is Wave B / out of this task's scope).
 */
import type { ReactNode } from 'react';
import { BlurView } from 'expo-blur';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { VaultPalette } from './VaultPalette';

export interface VaultHeaderChipProps {
  children?: ReactNode;
  /** Defaults to the design's 16, which turns a 32pt square into a circle. */
  cornerRadius?: number;
  overCamera?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function VaultHeaderChip({
  children,
  cornerRadius = 16,
  overCamera = false,
  style,
}: VaultHeaderChipProps) {
  if (overCamera) {
    return (
      <BlurView
        intensity={40}
        tint="dark"
        style={[styles.overCamera, { borderRadius: cornerRadius }, style]}
      >
        {children}
      </BlurView>
    );
  }
  return <View style={[styles.chip, { borderRadius: cornerRadius }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: VaultPalette.headerChip,
    overflow: 'hidden',
    // Swift: `.shadow(color: .black.opacity(0.05), radius: 2, y: 4)`.
    boxShadow: '0px 4px 2px rgba(0, 0, 0, 0.05)',
  },
  overCamera: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
});
