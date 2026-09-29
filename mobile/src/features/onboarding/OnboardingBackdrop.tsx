import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export function OnboardingBackdrop({
  style,
  blurTarget,
}: {
  style?: StyleProp<ViewStyle>;
  blurTarget?: RefObject<View | null>;
}) {
  return (
    <View pointerEvents="none" style={style}>
      <MaskedView
        style={{ position: 'absolute', top: -30, bottom: -60, left: -30, right: -30 }}
        maskElement={
          <LinearGradient
            colors={['transparent', 'black', 'black']}
            locations={[0, 0.2, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <BlurView
          blurTarget={blurTarget}
          blurMethod="dimezisBlurView"
          blurReductionFactor={4}
          intensity={60}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.15)' }]} />
      </MaskedView>
    </View>
  );
}
