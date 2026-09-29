import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { FriendProfileTabs } from './FriendProfileTabs';

beforeAll(() => {
  initI18n();
});

describe('FriendProfileTabs', () => {
  it('renders both tab labels and fires onChange for the unselected tab', async () => {
    const onChange = jest.fn();
    await render(<FriendProfileTabs value="friends" onChange={onChange} />);

    expect(screen.getByText('Friends')).toBeTruthy();
    expect(screen.getByText('Public plans')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('friend-tab-plans'));
    expect(onChange).toHaveBeenCalledWith('plans');
  });

  it('does not fire onChange when tapping the already-selected tab', async () => {
    const onChange = jest.fn();
    await render(<FriendProfileTabs value="friends" onChange={onChange} />);

    await fireEvent.press(screen.getByTestId('friend-tab-friends'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
