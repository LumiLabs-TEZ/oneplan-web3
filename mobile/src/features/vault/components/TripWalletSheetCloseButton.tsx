/**
 * Port of `TripWalletSheetCloseButton` (`ios/OnePlan/OnePlan/View/Wallet/HowMoneyIsHeldView.swift`,
 * `origin/feat/web3-version`) — the glass "x" control shared by the trip-wallet welcome + how-
 * money-is-held sheets.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { GlassSurface } from '@/ui/components/GlassSurface';
import { SFSymbol } from '@/ui/components/SFSymbol';

/** Swift: `Color(red: 0x72/255, green: 0x72/255, blue: 0x72/255)` — not a theme token. */
const ICON_COLOR = '#727272';

export interface TripWalletSheetCloseButtonProps {
  onPress: () => void;
  testID?: string;
}

export function TripWalletSheetCloseButton({
  onPress,
  testID,
}: TripWalletSheetCloseButtonProps) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Close')}
      onPress={onPress}
      hitSlop={6}
      testID={testID}
    >
      <GlassSurface preset="control" radius={999} style={styles.icon}>
        <SFSymbol
          name="xmark"
          fallback="close"
          size={17}
          frame={36}
          weight="500"
          color={ICON_COLOR}
        />
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
