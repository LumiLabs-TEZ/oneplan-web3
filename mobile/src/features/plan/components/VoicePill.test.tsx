import { fireEvent, render, screen } from '@testing-library/react-native';

import { VoicePill } from './VoicePill';

describe('VoicePill', () => {
  it('shows the formatted duration', async () => {
    await render(<VoicePill durationSeconds={72} playing={false} testID="pill" />);
    expect(screen.getByText('1:12')).toBeTruthy();
  });

  it('fires onPress when tappable', async () => {
    const onPress = jest.fn();
    await render(
      <VoicePill durationSeconds={72} playing={false} onPress={onPress} testID="pill" />,
    );
    await fireEvent.press(screen.getByTestId('pill'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled when no onPress is given', async () => {
    await render(<VoicePill durationSeconds={72} playing={false} testID="pill" />);
    expect(screen.getByTestId('pill').props.accessibilityState?.disabled).toBe(true);
  });
});
