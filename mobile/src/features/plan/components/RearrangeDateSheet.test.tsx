import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { initI18n } from '@/i18n';

import { RearrangeDateSheet } from './RearrangeDateSheet';
import type { DayContext } from '../helpers/planDays';

const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems: [] };

beforeAll(() => {
  initI18n();
});

describe('RearrangeDateSheet', () => {
  it('renders one row per day', async () => {
    await render(
      <RearrangeDateSheet
        ctx={ctx}
        days={[1, 2, 3]}
        onRearrange={jest.fn()}
        onDeleteDay={jest.fn()}
      />,
    );
    expect(screen.getByTestId('rearrange-sheet')).toBeTruthy();
    expect(screen.getByTestId('rearrange-row-1')).toBeTruthy();
    expect(screen.getByTestId('rearrange-row-2')).toBeTruthy();
    expect(screen.getByTestId('rearrange-row-3')).toBeTruthy();
  });

  it('renders the title and subtitle', async () => {
    await render(
      <RearrangeDateSheet
        ctx={ctx}
        days={[1, 2]}
        onRearrange={jest.fn()}
        onDeleteDay={jest.fn()}
      />,
    );
    expect(screen.getByText('Re-arrange your trip')).toBeTruthy();
    expect(screen.getByText('Drag to arrange or tap “Delete” to erase plan')).toBeTruthy();
  });

  it('disables Delete when only one day exists', async () => {
    await render(
      <RearrangeDateSheet ctx={ctx} days={[1]} onRearrange={jest.fn()} onDeleteDay={jest.fn()} />,
    );
    expect(screen.getByTestId('rearrange-delete-1').props.accessibilityState.disabled).toBe(true);
  });

  it('enables Delete when more than one day exists', async () => {
    await render(
      <RearrangeDateSheet
        ctx={ctx}
        days={[1, 2]}
        onRearrange={jest.fn()}
        onDeleteDay={jest.fn()}
      />,
    );
    expect(screen.getByTestId('rearrange-delete-1').props.accessibilityState.disabled).toBe(false);
  });

  it('pressing Delete shows a confirm Alert, and confirming calls onDeleteDay', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const deleteButton = buttons?.find((b) => b.text === 'Delete');
      deleteButton?.onPress?.();
    });
    const onDeleteDay = jest.fn();
    await render(
      <RearrangeDateSheet
        ctx={ctx}
        days={[1, 2]}
        onRearrange={jest.fn()}
        onDeleteDay={onDeleteDay}
      />,
    );

    await fireEvent.press(screen.getByTestId('rearrange-delete-2'));

    expect(alertSpy).toHaveBeenCalled();
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Delete every plan in Day 2?');
    expect(alertSpy.mock.calls[0]?.[1]).toBe('This will delete every plan in this day.');
    expect(onDeleteDay).toHaveBeenCalledWith(2);

    alertSpy.mockRestore();
  });

  it('pressing Delete while disabled (single day) does nothing', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onDeleteDay = jest.fn();
    await render(
      <RearrangeDateSheet ctx={ctx} days={[1]} onRearrange={jest.fn()} onDeleteDay={onDeleteDay} />,
    );

    await fireEvent.press(screen.getByTestId('rearrange-delete-1'));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onDeleteDay).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
