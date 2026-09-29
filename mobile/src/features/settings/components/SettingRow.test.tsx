import { fireEvent, render } from '@testing-library/react-native';

import { SettingRow } from './SettingRow';

describe('SettingRow', () => {
  it('renders the title and trailing value', async () => {
    const screen = await render(
      <SettingRow icon="person-outline" title="Display name" trailing="Ken" testID="row" />,
    );
    expect(screen.getByTestId('row-title')).toHaveTextContent('Display name');
    expect(screen.getByText('Ken')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <SettingRow icon="log-out-outline" title="Log out" onPress={onPress} testID="row" />,
    );
    await fireEvent.press(screen.getByTestId('row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders a toggle and reports changes, without a wrapping button', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <SettingRow
        icon="notifications-outline"
        title="Trip tips & nudges"
        toggle={{ value: false, onChange }}
        testID="row"
      />,
    );
    await fireEvent(screen.getByTestId('row-toggle'), 'valueChange', true);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not fire onPress while disabled', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <SettingRow icon="log-out-outline" title="Log out" onPress={onPress} disabled testID="row" />,
    );
    await fireEvent.press(screen.getByTestId('row'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
