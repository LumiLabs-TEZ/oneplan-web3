import * as Haptics from 'expo-haptics';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { TripTabBar } from './TripTabBar';

describe('TripTabBar', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders all five localized titles and fires onChange with a light haptic', async () => {
    const onChange = jest.fn();
    await render(<TripTabBar active="history" onChange={onChange} enabled />);

    for (const title of ['History', 'Your plan', 'Note', 'Members', 'Insight']) {
      expect(screen.getByText(title)).toBeTruthy();
    }

    await fireEvent.press(screen.getByText('Members'));
    expect(onChange).toHaveBeenCalledWith('members');
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('does not re-fire when the active tab is pressed', async () => {
    const onChange = jest.fn();
    await render(<TripTabBar active="history" onChange={onChange} enabled />);
    await fireEvent.press(screen.getByText('History'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores every press and dims the bar when disabled', async () => {
    const onChange = jest.fn();
    await render(<TripTabBar active="history" onChange={onChange} enabled={false} />);
    await fireEvent.press(screen.getByText('Note'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('trip-tab-bar')).toHaveStyle({ opacity: 0.5 });
  });

  it('ignores presses on individually disabled tabs but keeps the rest live', async () => {
    const onChange = jest.fn();
    await render(
      <TripTabBar
        active="history"
        onChange={onChange}
        enabled
        disabledTabs={['plan', 'note', 'members', 'insight']}
      />,
    );
    await fireEvent.press(screen.getByText('Your plan'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('trip-tab-plan')).toBeDisabled();
    expect(screen.getByTestId('trip-tab-plan').props.accessibilityState).toMatchObject({
      disabled: true,
      selected: false,
    });
    expect(screen.getByTestId('trip-tab-history').props.accessibilityState).toMatchObject({
      selected: true,
      disabled: false,
    });
  });

  it('renders only the requested tabs', async () => {
    await render(
      <TripTabBar
        active="history"
        onChange={jest.fn()}
        enabled
        availableTabs={['history', 'plan']}
      />,
    );
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Your plan')).toBeTruthy();
    expect(screen.queryByText('Insight')).toBeNull();
  });
});
