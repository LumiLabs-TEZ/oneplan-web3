import * as Haptics from 'expo-haptics';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './Button';

describe('Button', () => {
  it('fires onPress and the source medium impact', async () => {
    const onPress = jest.fn();
    await render(<Button title="Continue" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Continue'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });

  it('does not fire onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button title="Continue" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByText('Continue'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows an ActivityIndicator instead of the title while loading and blocks presses', async () => {
    const onPress = jest.fn();
    await render(<Button title="Continue" onPress={onPress} loading />);
    expect(screen.getByTestId('button-loading')).toBeTruthy();
    expect(screen.queryByText('Continue')).toBeNull();
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders an icon-only toolbar button', async () => {
    await render(
      <Button
        variant="toolbarIcon"
        accessibilityLabel="Close"
        icon={<></>}
        onPress={jest.fn()}
        testID="toolbar"
      />,
    );
    expect(screen.getByTestId('toolbar')).toHaveStyle({ width: 40, height: 40 });
  });
});
