import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { RecordButton } from './RecordButton';

beforeAll(() => {
  initI18n();
});

describe('RecordButton', () => {
  it('shows "Record" and fires onPress when idle', async () => {
    const onPress = jest.fn();
    await render(<RecordButton hasRecording={false} onPress={onPress} />);
    expect(screen.getByText('Record')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-record'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows "Recorded" and the delete button once a recording exists', async () => {
    const onDelete = jest.fn();
    await render(<RecordButton hasRecording onPress={jest.fn()} onDelete={onDelete} />);
    expect(screen.getByText('Recorded')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-record-delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('hides the delete button when no onDelete is given', async () => {
    await render(<RecordButton hasRecording onPress={jest.fn()} />);
    expect(screen.queryByTestId('plan-record-delete')).toBeNull();
  });
});
