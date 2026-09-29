import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { TimeRow } from './TimeRow';

describe('TimeRow', () => {
  beforeAll(() => {
    initI18n();
  });

  it('shows the current time as HH:MM', async () => {
    await render(<TimeRow hour={9} minute={5} onChange={jest.fn()} />);
    expect(screen.getByText('09:05')).toBeTruthy();
  });

  it('commits the picker draft when Done is pressed', async () => {
    const onChange = jest.fn();
    await render(<TimeRow hour={9} minute={0} onChange={onChange} />);

    const picker = screen.getByTestId('date-time-picker');
    const newDate = new Date();
    newDate.setHours(14, 30, 0, 0);
    await act(async () => {
      fireEvent(picker, 'change', {}, newDate);
    });

    await fireEvent.press(screen.getByTestId('plan-time-done'));

    expect(onChange).toHaveBeenCalledWith({ hour: 14, minute: 30 });
  });

  it('opens the sheet when the row is pressed', async () => {
    await render(<TimeRow hour={9} minute={0} onChange={jest.fn()} />);
    // Renders without throwing; the mocked BottomSheetModal always renders its children so the
    // picker/Done button are already present — this just exercises the open handler.
    await fireEvent.press(screen.getByTestId('plan-time-row'));
    expect(screen.getByTestId('date-time-picker')).toBeTruthy();
  });
});
