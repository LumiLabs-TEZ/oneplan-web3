import * as Haptics from 'expo-haptics';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { GlassIconButton } from './GlassIconButton';

describe('GlassIconButton', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fires onPress with a light impact', async () => {
    const onPress = jest.fn();
    await render(<GlassIconButton label="Close" icon="close" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('skips the haptic when opted out', async () => {
    const onPress = jest.fn();
    await render(<GlassIconButton label="Close" icon="close" onPress={onPress} haptic={false} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
