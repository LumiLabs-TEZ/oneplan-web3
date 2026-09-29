import { fireEvent, render, screen } from '@testing-library/react-native';

import { Calendar, EMPTY_RANGE, rangeInMonth } from './Calendar';

const today = new Date(2026, 8, 14); // Sep 14 2026
const emptyRange = { start: null, end: null };

describe('Calendar', () => {
  it('renders all 30 days of September 2026', async () => {
    await render(
      <Calendar
        year={2026}
        month0={8}
        range={emptyRange}
        minDate={today}
        today={today}
        onTap={jest.fn()}
      />,
    );

    for (const day of [1, 15, 30]) {
      expect(screen.getByText(String(day))).toBeTruthy();
    }
  });

  it('does not call onTap for a day before minDate', async () => {
    const onTap = jest.fn();
    await render(
      <Calendar
        year={2026}
        month0={8}
        range={emptyRange}
        minDate={today}
        today={today}
        onTap={onTap}
      />,
    );

    await fireEvent.press(screen.getByTestId('calendar-day-2026-09-01'));
    expect(onTap).not.toHaveBeenCalled();
  });

  it('calls onTap with the tapped date when it is on/after minDate', async () => {
    const onTap = jest.fn();
    await render(
      <Calendar
        year={2026}
        month0={8}
        range={emptyRange}
        minDate={today}
        today={today}
        onTap={onTap}
      />,
    );

    await fireEvent.press(screen.getByTestId('calendar-day-2026-09-20'));
    expect(onTap).toHaveBeenCalledWith(new Date(2026, 8, 20));
  });
});

describe('rangeInMonth', () => {
  const range = { start: new Date(2026, 8, 28), end: new Date(2026, 9, 3) }; // Sep 28 – Oct 3

  it('passes the range through to every month it touches', () => {
    expect(rangeInMonth(range, 2026, 8)).toBe(range);
    expect(rangeInMonth(range, 2026, 9)).toBe(range);
  });

  it('gives untouched months the shared empty range', () => {
    expect(rangeInMonth(range, 2026, 7)).toBe(EMPTY_RANGE);
    expect(rangeInMonth(range, 2026, 10)).toBe(EMPTY_RANGE);
    expect(rangeInMonth(emptyRange, 2026, 8)).toBe(EMPTY_RANGE);
  });

  it('handles an open-ended or reversed selection', () => {
    const startOnly = { start: new Date(2026, 9, 31, 15), end: null };
    expect(rangeInMonth(startOnly, 2026, 9)).toBe(startOnly);
    expect(rangeInMonth(startOnly, 2026, 10)).toBe(EMPTY_RANGE);
    const reversed = { start: new Date(2026, 10, 2), end: new Date(2026, 9, 30) };
    expect(rangeInMonth(reversed, 2026, 9)).toBe(reversed);
    expect(rangeInMonth(reversed, 2026, 10)).toBe(reversed);
    expect(rangeInMonth(reversed, 2026, 11)).toBe(EMPTY_RANGE);
  });

  it('spans a year boundary', () => {
    const newYear = { start: new Date(2026, 11, 30), end: new Date(2027, 0, 2) };
    expect(rangeInMonth(newYear, 2026, 11)).toBe(newYear);
    expect(rangeInMonth(newYear, 2027, 0)).toBe(newYear);
  });
});
