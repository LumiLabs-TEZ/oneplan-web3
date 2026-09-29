/**
 * The sky-blue → peach → page-background wash behind a receipt-style screen's hero — shared by
 * `VaultTransactionDetailScreen`, `WalletWithdrawResultScreen`, and `OnePlanWalletScreen`
 * (`origin/feat/web3-version`: `VaultTransactionDetailView`/`WalletWithdrawResultView`/
 * `OnePlanWalletView` each redeclare the same three-stop gradient inline).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

import { colors } from '@/ui/theme';

export interface VaultSkyGradientProps {
  height?: number;
  /** `WalletWithdrawResultScreen` tints this per status (completed/processing/failed). */
  colors?: readonly [string, string, string];
  locations?: readonly [number, number, number];
}

const DEFAULT_COLORS = ['rgb(180, 223, 255)', 'rgb(251, 236, 215)', colors.background] as const;
const DEFAULT_LOCATIONS = [0, 0.514, 1] as const;

export function VaultSkyGradient({
  height = 312,
  colors: colorsProp = DEFAULT_COLORS,
  locations = DEFAULT_LOCATIONS,
}: VaultSkyGradientProps) {
  return (
    <LinearGradient
      colors={colorsProp}
      locations={locations}
      style={[styles.gradient, { height }]}
    />
  );
}

const styles = StyleSheet.create({
  gradient: { position: 'absolute', top: 0, left: 0, right: 0 },
});
