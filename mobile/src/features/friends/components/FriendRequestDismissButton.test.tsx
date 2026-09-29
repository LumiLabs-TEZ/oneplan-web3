import { fireEvent, render, screen } from '@testing-library/react-native';

import { FriendRequestDismissButton } from './FriendRequestDismissButton';

describe('FriendRequestDismissButton', () => {
  it('fires onPress', async () => {
    const onPress = jest.fn();
    await render(
      <FriendRequestDismissButton onPress={onPress} accessibilityLabel="Close" testID="x" />,
    );
    await fireEvent.press(screen.getByTestId('x'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', async () => {
    const onPress = jest.fn();
    await render(
      <FriendRequestDismissButton
        onPress={onPress}
        disabled
        accessibilityLabel="Close"
        testID="x"
      />,
    );
    await fireEvent.press(screen.getByTestId('x'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
