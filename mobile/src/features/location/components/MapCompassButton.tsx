/**
 * Map compass for the location screen — replaces Google's native compass (which Android pins
 * under the status bar) with a glass button stacked above the locate button. The needle counter-
 * rotates with the camera heading so its red tip always points north; tapping resets north-up.
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useAppLanguage } from '@/i18n';
import { GlassIconButton } from '@/ui/components';
import { colors } from '@/ui/theme';

const NEEDLE_NORTH = '#F04438';

export interface MapCompassButtonProps {
  /** Live camera heading in degrees (0 = north-up). */
  heading: SharedValue<number>;
  onPress: () => void;
}

export function MapCompassButton({ heading, onPress }: MapCompassButtonProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-heading.value}deg` }],
  }));

  return (
    <GlassIconButton label={t('Compass')} onPress={onPress} testID="location-compass">
      <Animated.View style={[styles.needle, needleStyle]}>
        <Svg width={14} height={24} viewBox="0 0 14 24">
          <Path d="M7 0 L14 12 L0 12 Z" fill={NEEDLE_NORTH} />
          <Path d="M0 12 L14 12 L7 24 Z" fill={colors.contentM} />
        </Svg>
      </Animated.View>
    </GlassIconButton>
  );
}

const styles = StyleSheet.create({
  needle: { alignItems: 'center', justifyContent: 'center' },
});
