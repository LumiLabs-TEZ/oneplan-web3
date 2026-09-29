import { requireNativeView } from 'expo';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export interface OnboardingCopyProps {
  items: { title: string; subtitle: string }[];
  index: number;
  reducedMotion: boolean;
  style?: StyleProp<ViewStyle>;
}

const NativeCopy = requireNativeView<OnboardingCopyProps>('ParityUI', 'OnboardingCopyView');

export function OnboardingCopy({ style, ...props }: OnboardingCopyProps) {
  const item = props.items[props.index];
  return (
    <View
      style={style}
      accessible
      accessibilityRole="text"
      accessibilityLabel={item ? [item.title, item.subtitle].filter(Boolean).join('. ') : ''}
    >
      <NativeCopy {...props} style={{ flex: 1 }} />
    </View>
  );
}
