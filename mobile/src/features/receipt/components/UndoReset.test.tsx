import { act, fireEvent, render } from '@testing-library/react-native';
import { UndoReset } from './UndoReset';
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/i18n', () => ({ useAppLanguage: jest.fn() }));
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
it('undoes a short tap, but not a 300ms hold', async () => {
  const undo = jest.fn();
  const reset = jest.fn();
  const view = await render(<UndoReset hasHistory onUndo={undo} onReset={reset} />);
  await fireEvent(view.getByTestId('receipt-undo'), 'pressIn');
  await act(() => {
    jest.advanceTimersByTime(200);
  });
  await fireEvent(view.getByTestId('receipt-undo'), 'pressOut');
  expect(undo).toHaveBeenCalledTimes(1);
  await fireEvent(view.getByTestId('receipt-undo'), 'pressIn');
  await act(() => {
    jest.advanceTimersByTime(300);
  });
  await fireEvent(view.getByTestId('receipt-undo'), 'pressOut');
  expect(undo).toHaveBeenCalledTimes(1);
  expect(reset).not.toHaveBeenCalled();
});
it('resets only after three seconds and cancels on early release or unmount', async () => {
  const reset = jest.fn();
  const undo = jest.fn();
  const view = await render(<UndoReset hasHistory onUndo={undo} onReset={reset} />);
  await fireEvent(view.getByTestId('receipt-undo'), 'pressIn');
  await act(() => {
    jest.advanceTimersByTime(2999);
  });
  expect(reset).not.toHaveBeenCalled();
  await fireEvent(view.getByTestId('receipt-undo'), 'pressOut');
  await act(() => {
    jest.advanceTimersByTime(100);
  });
  expect(reset).not.toHaveBeenCalled();
  await fireEvent(view.getByTestId('receipt-undo'), 'pressIn');
  await act(() => {
    jest.advanceTimersByTime(3000);
  });
  expect(reset).toHaveBeenCalledTimes(1);
  expect(undo).not.toHaveBeenCalled();
  await fireEvent(view.getByTestId('receipt-undo'), 'pressOut');
  await fireEvent(view.getByTestId('receipt-undo'), 'pressIn');
  await view.unmount();
  await act(() => {
    jest.advanceTimersByTime(3000);
  });
  expect(reset).toHaveBeenCalledTimes(1);
});
