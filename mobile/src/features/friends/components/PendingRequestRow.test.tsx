import { fireEvent, render, screen } from '@testing-library/react-native';

import { PendingRequestRow } from './PendingRequestRow';

describe('PendingRequestRow', () => {
  it('renders name and subtitle, and fires onPress', async () => {
    const onPress = jest.fn();
    await render(
      <PendingRequestRow
        name="Bao"
        subtitle="1 mutual friend"
        onPress={onPress}
        testID="friend-request-row-5"
      />,
    );

    expect(screen.getByText('Bao')).toBeTruthy();
    expect(screen.getByText('1 mutual friend')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('friend-request-row-5'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
