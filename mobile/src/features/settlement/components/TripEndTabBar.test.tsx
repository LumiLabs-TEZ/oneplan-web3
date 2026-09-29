import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { TripEndTabBar } from './TripEndTabBar';

// The JS bar is `MorphingTabBar` (a pan-gesture row); its segments select via the `activate`
// accessibility action, the same path VoiceOver/TalkBack use.
const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

describe('TripEndTabBar', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders both tabs and marks the active one selected', async () => {
    const screen = await render(<TripEndTabBar value="history" onChange={jest.fn()} />);
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Breakdown')).toBeTruthy();
    expect(screen.getByTestId('tab-history').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByTestId('tab-breakdown').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('reports a switch, and ignores the active tab', async () => {
    const onChange = jest.fn();
    const screen = await render(<TripEndTabBar value="history" onChange={onChange} />);
    await activate(screen.getByTestId('tab-history'));
    expect(onChange).not.toHaveBeenCalled();
    await activate(screen.getByTestId('tab-breakdown'));
    expect(onChange).toHaveBeenCalledWith('breakdown');
  });
});
