import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { StartTripSheet } from './StartTripSheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

const TODAY = new Date(2026, 0, 5); // Jan 5 2026

describe('StartTripSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('keeps the start button disabled until a range is confirmed', async () => {
    const onStart = jest.fn();
    const screen = await render(
      <StartTripSheet startDate={null} endDate={null} onStart={onStart} today={TODAY} />,
    );

    expect(screen.getByTestId('start-trip-button').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Start your trip now')).toBeTruthy();
    expect(screen.getByText('or pick your start date')).toBeTruthy();

    // Picking only a start day is not enough — the picker has to be confirmed.
    await fireEvent.press(screen.getByTestId('calendar-day-2026-01-09'));
    expect(screen.getByTestId('start-trip-button').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId('calendar-day-2026-01-11'));
    await fireEvent.press(screen.getByTestId('start-trip-dates-confirm'));

    expect(screen.getByTestId('start-trip-button').props.accessibilityState.disabled).toBe(false);
  });

  it('reports the confirmed range', async () => {
    const onStart = jest.fn();
    const screen = await render(
      <StartTripSheet startDate={null} endDate={null} onStart={onStart} today={TODAY} />,
    );

    await fireEvent.press(screen.getByTestId('calendar-day-2026-01-09'));
    await fireEvent.press(screen.getByTestId('calendar-day-2026-01-11'));
    await fireEvent.press(screen.getByTestId('start-trip-dates-confirm'));
    await fireEvent.press(screen.getByTestId('start-trip-button'));

    expect(onStart).toHaveBeenCalledTimes(1);
    const range = onStart.mock.calls[0]?.[0];
    expect(range.start.getTime()).toBe(new Date(2026, 0, 9).getTime());
    expect(range.end.getTime()).toBe(new Date(2026, 0, 11).getTime());
  });

  it('starts enabled when the trip already carries both dates', async () => {
    const screen = await render(
      <StartTripSheet
        startDate="2026-01-09"
        endDate="2026-01-11"
        onStart={jest.fn()}
        today={TODAY}
      />,
    );
    expect(screen.getByTestId('start-trip-button').props.accessibilityState.disabled).toBe(false);
  });

  it('disables the button while the mutation is in flight', async () => {
    const screen = await render(
      <StartTripSheet
        startDate="2026-01-09"
        endDate="2026-01-11"
        onStart={jest.fn()}
        today={TODAY}
        submitting
      />,
    );
    expect(screen.getByTestId('start-trip-button').props.accessibilityState.disabled).toBe(true);
  });
});
