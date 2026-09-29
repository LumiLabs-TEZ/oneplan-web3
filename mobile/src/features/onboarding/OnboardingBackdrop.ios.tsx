import { requireNativeView } from 'expo';
import type { RefObject } from 'react';
import type { StyleProp, View, ViewStyle } from 'react-native';

const NativeBackdrop = requireNativeView<{ style?: StyleProp<ViewStyle> }>(
  'ParityUI',
  'OnboardingBackdropView',
);
export function OnboardingBackdrop({
  style,
}: {
  style?: StyleProp<ViewStyle>;
  blurTarget?: RefObject<View | null>;
}) {
  return <NativeBackdrop style={style} />;
}
