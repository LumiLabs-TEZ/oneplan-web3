import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { initI18n } from '@/i18n';

import { DayChipStrip } from './DayChipStrip';
import type { DayContext } from '../helpers/planDays';

beforeAll(() => {
  initI18n();
});

const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems: [] };

describe('DayChipStrip', () => {
  it('renders one chip per day', async () => {
    await render(
      <DayChipStrip
        ctx={ctx}
        days={[1, 2, 3]}
        selected={1}
        onSelect={jest.fn()}
        readOnly={false}
        locale="en"
      />,
    );
    expect(screen.getByTestId('plan-day-chip-1')).toBeTruthy();
    expect(screen.getByTestId('plan-day-chip-2')).toBeTruthy();
    expect(screen.getByTestId('plan-day-chip-3')).toBeTruthy();
    expect(screen.getAllByText(/Day \d/)).toHaveLength(3);
  });

  it('calls onSelect with the tapped day', async () => {
    const onSelect = jest.fn();
    await render(
      <DayChipStrip
        ctx={ctx}
        days={[1, 2]}
        selected={1}
        onSelect={onSelect}
        readOnly={false}
        locale="en"
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-day-chip-2'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('fires a light haptic when a chip is selected', async () => {
    await render(
      <DayChipStrip
        ctx={ctx}
        days={[1, 2]}
        selected={1}
        onSelect={jest.fn()}
        readOnly={false}
        locale="en"
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-day-chip-2'));
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('shows the "+ add" chip only when onAddDay is given and not read-only', async () => {
    const { rerender } = await render(
      <DayChipStrip
        ctx={ctx}
        days={[1]}
        selected={1}
        onSelect={jest.fn()}
        onAddDay={jest.fn()}
        readOnly={false}
        locale="en"
      />,
    );
    expect(screen.getByTestId('plan-add-day-chip')).toBeTruthy();

    await rerender(
      <DayChipStrip
        ctx={ctx}
        days={[1]}
        selected={1}
        onSelect={jest.fn()}
        readOnly={false}
        locale="en"
      />,
    );
    expect(screen.queryByTestId('plan-add-day-chip')).toBeNull();

    await rerender(
      <DayChipStrip
        ctx={ctx}
        days={[1]}
        selected={1}
        onSelect={jest.fn()}
        onAddDay={jest.fn()}
        readOnly
        locale="en"
      />,
    );
    expect(screen.queryByTestId('plan-add-day-chip')).toBeNull();
  });

  it('calls onAddDay when the "+ add" chip is pressed', async () => {
    const onAddDay = jest.fn();
    await render(
      <DayChipStrip
        ctx={ctx}
        days={[1]}
        selected={1}
        onSelect={jest.fn()}
        onAddDay={onAddDay}
        readOnly={false}
        locale="en"
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-add-day-chip'));
    expect(onAddDay).toHaveBeenCalledTimes(1);
  });

  it('fires onLongPress on a long press', async () => {
    const onLongPress = jest.fn();
    await render(
      <DayChipStrip
        ctx={ctx}
        days={[1]}
        selected={1}
        onSelect={jest.fn()}
        onLongPress={onLongPress}
        readOnly={false}
        locale="en"
      />,
    );
    const chip = screen.getByTestId('plan-day-chip-1');
    await fireEvent(chip, 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('waits the full 450ms delay before firing onLongPress (regression guard on LONG_PRESS_MS)', async () => {
    // `delayLongPress` isn't exposed on the rendered host node (Pressable/Pressability consumes
    // it internally rather than forwarding it as a prop), so the only way to pin the exact delay
    // is to drive Pressability's own responder-grant timer with fake timers, mirroring how RN's
    // long-press detection actually schedules `_handleLongPress`
    // (`node_modules/react-native/Libraries/Pressability/Pressability.js`).
    jest.useFakeTimers();
    const onLongPress = jest.fn();
    await render(
      <DayChipStrip
        ctx={ctx}
        days={[1]}
        selected={1}
        onSelect={jest.fn()}
        onLongPress={onLongPress}
        readOnly={false}
        locale="en"
      />,
    );
    const chip = screen.getByTestId('plan-day-chip-1');
    const grantEvent = {
      persist: () => {},
      currentTarget: 1,
      nativeEvent: { timestamp: Date.now() },
    };

    await act(async () => {
      fireEvent(chip, 'responderGrant', grantEvent);
    });
    await act(async () => {
      jest.advanceTimersByTime(449);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('renders nothing when there are no days', async () => {
    const { toJSON } = await render(
      <DayChipStrip
        ctx={ctx}
        days={[]}
        selected={null}
        onSelect={jest.fn()}
        readOnly={false}
        locale="en"
      />,
    );
    expect(toJSON()).toBeNull();
  });
});
