import { fireEvent, render, screen } from '@testing-library/react-native';

import { AddFriendButton } from './AddFriendButton';

describe('AddFriendButton', () => {
  it('renders the title and fires onPress', async () => {
    const onPress = jest.fn();
    await render(<AddFriendButton title="Accept" onPress={onPress} testID="btn" />);
    expect(screen.getByText('Accept')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while disabled', async () => {
    const onPress = jest.fn();
    await render(<AddFriendButton title="Accept" onPress={onPress} disabled testID="btn" />);
    await fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner instead of the title while loading and ignores presses', async () => {
    const onPress = jest.fn();
    await render(<AddFriendButton title="Accept" onPress={onPress} loading testID="btn" />);
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.getByTestId('add-friend-button-loading')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
