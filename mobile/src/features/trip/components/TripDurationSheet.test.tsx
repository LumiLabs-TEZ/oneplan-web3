import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { TripDurationSheet } from './TripDurationSheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

const TODAY = new Date(2026, 0, 5); // Jan 5 2026

describe('TripDurationSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('keeps Confirm disabled until a start date is picked', async () => {
    const onConfirm = jest.fn();
    const screen = await render(
      <TripDurationSheet range={{ start: null, end: null }} onConfirm={onConfirm} today={TODAY} />,
    );

    expect(screen.getByTestId('duration-confirm').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId('calendar-day-2026-01-09'));

    expect(screen.getByTestId('duration-confirm').props.accessibilityState.disabled).toBe(false);
  });

  it('passes a normalized range to onConfirm', async () => {
    const onConfirm = jest.fn();
    const screen = await render(
      <TripDurationSheet range={{ start: null, end: null }} onConfirm={onConfirm} today={TODAY} />,
    );

    await fireEvent.press(screen.getByTestId('calendar-day-2026-01-09'));
    await fireEvent.press(screen.getByTestId('calendar-day-2026-01-11'));
    await fireEvent.press(screen.getByTestId('duration-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const range = onConfirm.mock.calls[0]?.[0];
    expect(range.start.getTime()).toBe(new Date(2026, 0, 9).getTime());
    expect(range.end.getTime()).toBe(new Date(2026, 0, 11).getTime());
  });

  it('defaults a single-day tap to start === end', async () => {
    const onConfirm = jest.fn();
    const screen = await render(
      <TripDurationSheet range={{ start: null, end: null }} onConfirm={onConfirm} today={TODAY} />,
    );

    await fireEvent.press(screen.getByTestId('calendar-day-2026-01-09'));
    await fireEvent.press(screen.getByTestId('duration-confirm'));

    const range = onConfirm.mock.calls[0]?.[0];
    expect(range.start.getTime()).toBe(range.end.getTime());
  });
});

describe('TripDurationSheet minStart', () => {
  beforeAll(() => {
    initI18n();
  });

  it('starts the calendar at minStart and rejects earlier taps', async () => {
    const onConfirm = jest.fn();
    const screen = await render(
      <TripDurationSheet
        range={{ start: null, end: null }}
        onConfirm={onConfirm}
        today={TODAY}
        minStart={new Date(2026, 1, 10)} // Feb 10 2026
        title="Choose trip dates"
      />,
    );

    expect(screen.getByText('Choose trip dates')).toBeTruthy();
    // January is below the floor, so it is not even rendered.
    expect(screen.queryByTestId('calendar-day-2026-01-09')).toBeNull();

    await fireEvent.press(screen.getByTestId('calendar-day-2026-02-09'));
    expect(screen.getByTestId('duration-confirm').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId('calendar-day-2026-02-11'));
    expect(screen.getByTestId('duration-confirm').props.accessibilityState.disabled).toBe(false);
  });
});
