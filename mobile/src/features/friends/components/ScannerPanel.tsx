/**
 * Rounded camera preview panel revealed by the pull-to-reveal gesture on the invite screen.
 * Port of `scannerRevealLayer` (InviteView.swift:245-280) minus the reveal animation itself,
 * which lives in `profile/invite.tsx` — this component only decides camera sizing/framing.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { QRScanner } from '@/native/camera/QRScanner';
import { colors } from '@/ui/theme';

export interface ScannerPanelProps {
  /** Only listens for barcodes while `true` — forwarded to `QRScanner`. */
  active: boolean;
  /** Panel width/height in points — `min(screenWidth - 32, 360)` at the call site. */
  size: number;
  onCode: (raw: string) => void;
  style?: StyleProp<ViewStyle>;
}

export function ScannerPanel({ active, size, onCode, style }: ScannerPanelProps) {
  return (
    <View style={[styles.panel, { width: size, height: size }, style]} testID="qr-scanner-panel">
      <QRScanner active={active} onCode={onCode} style={styles.scanner} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.dividerStroke,
    backgroundColor: colors.onSurface,
  },
  scanner: { flex: 1 },
});
