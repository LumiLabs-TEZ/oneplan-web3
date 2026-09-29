import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { initI18n } from '@/i18n';

import { PlanFormDayChips } from './PlanFormDayChips';
import type { DayContext } from '../helpers/planDays';

const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems: [] };

describe('PlanFormDayChips', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders one chip per day with the form testID', async () => {
    await render(
      <PlanFormDayChips
        ctx={ctx}
        days={[1, 2]}
        selected={1}
        onSelect={jest.fn()}
        canAddDay={false}
        locale="en"
      />,
    );
    expect(screen.getByTestId('plan-form-day-chip-1')).toBeTruthy();
    expect(screen.getByTestId('plan-form-day-chip-2')).toBeTruthy();
  });

  it('calls onSelect with the tapped day', async () => {
    const onSelect = jest.fn();
    await render(
      <PlanFormDayChips
        ctx={ctx}
        days={[1, 2]}
        selected={1}
        onSelect={onSelect}
        canAddDay={false}
        locale="en"
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-form-day-chip-2'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('shows the "+ add" chip only when canAddDay and onAddDay are given', async () => {
    await render(
      <PlanFormDayChips
        ctx={ctx}
        days={[1]}
        selected={1}
        onSelect={jest.fn()}
        onAddDay={jest.fn()}
        canAddDay
        locale="en"
      />,
    );
    expect(screen.getByTestId('plan-form-add-day-chip')).toBeTruthy();
  });

  it('confirms deletion via Alert on a 100ms long press, only when more than one day exists', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onDeleteDay = jest.fn();
    await render(
      <PlanFormDayChips
        ctx={ctx}
        days={[1, 2]}
        selected={1}
        onSelect={jest.fn()}
        onDeleteDay={onDeleteDay}
        canAddDay={false}
        locale="en"
      />,
    );
    await act(async () => {
      fireEvent(screen.getByTestId('plan-form-day-chip-1'), 'longPress');
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete Day 1?',
      'All plans on Day 1 will be deleted. Plans on later days will be moved up.',
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Delete')?.onPress?.();
    expect(onDeleteDay).toHaveBeenCalledWith(1);

    alertSpy.mockRestore();
  });

  it('does not confirm deletion when only one day exists', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(
      <PlanFormDayChips
        ctx={ctx}
        days={[1]}
        selected={1}
        onSelect={jest.fn()}
        onDeleteDay={jest.fn()}
        canAddDay={false}
        locale="en"
      />,
    );
    await act(async () => {
      fireEvent(screen.getByTestId('plan-form-day-chip-1'), 'longPress');
    });
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
