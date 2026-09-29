import { fireEvent, render, screen } from '@testing-library/react-native';

import { FriendRow } from './FriendRow';

describe('FriendRow', () => {
  it('renders name and subtitle', async () => {
    await render(<FriendRow name="Alice" subtitle="3 mutual friends" testID="row" />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('3 mutual friends')).toBeTruthy();
  });

  it('calls onPress when the row is tapped', async () => {
    const onPress = jest.fn();
    await render(<FriendRow name="Alice" subtitle="" onPress={onPress} testID="row" />);
    await fireEvent.press(screen.getByTestId('row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders an enabled trailing action and forwards its press', async () => {
    const onPress = jest.fn();
    await render(
      <FriendRow name="Bob" subtitle="" trailing={{ label: 'Invite', onPress }} testID="row" />,
    );
    await fireEvent.press(screen.getByTestId('row-trailing'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disables the trailing action and never calls onPress', async () => {
    const onPress = jest.fn();
    await render(
      <FriendRow
        name="Bob"
        subtitle=""
        trailing={{ label: 'Sent', disabled: true, onPress }}
        testID="row"
      />,
    );
    await fireEvent.press(screen.getByTestId('row-trailing'));
    expect(onPress).not.toHaveBeenCalled();
  });

  // Regression: a disabled RN `Pressable` declines the responder, so a tap on a naively
  // `disabled`-prop trailing pill would fall through to the row's own `onPress` — a dead
  // zone in iOS, so it must be one here too when the row itself is also pressable.
  it('the disabled trailing action is a true dead zone — it does not fall through to the row onPress', async () => {
    const rowOnPress = jest.fn();
    const trailingOnPress = jest.fn();
    await render(
      <FriendRow
        name="Bob"
        subtitle=""
        onPress={rowOnPress}
        trailing={{ label: 'Sent', disabled: true, onPress: trailingOnPress }}
        testID="row"
      />,
    );

    await fireEvent.press(screen.getByTestId('row-trailing'));

    expect(trailingOnPress).not.toHaveBeenCalled();
    expect(rowOnPress).not.toHaveBeenCalled();
  });
});
