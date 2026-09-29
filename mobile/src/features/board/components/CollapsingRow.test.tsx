import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { CollapsingRow } from './CollapsingRow';

function row(itemKey: number, collapsed: boolean, onCollapsed: () => void) {
  return (
    <CollapsingRow itemKey={itemKey} collapsed={collapsed} onCollapsed={onCollapsed}>
      <Text>{`row ${itemKey}`}</Text>
    </CollapsingRow>
  );
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('fires onCollapsed once the collapse finishes', async () => {
  const onCollapsed = jest.fn();
  const view = await render(row(1, false, onCollapsed));
  await view.rerender(row(1, true, onCollapsed));
  expect(onCollapsed).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(onCollapsed).toHaveBeenCalledTimes(1);
});

it('settles an in-flight collapse when the cell is recycled onto another item', async () => {
  const first = jest.fn();
  const second = jest.fn();
  const view = await render(row(1, false, first));
  await view.rerender(row(1, true, first));
  await act(async () => {
    jest.advanceTimersByTime(50);
  });
  await view.rerender(row(2, false, second));
  expect(first).toHaveBeenCalledTimes(1);
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  expect(screen.getByText('row 2')).toBeTruthy();
});

it('does not re-drop an already collapsed item on recycle', async () => {
  const first = jest.fn();
  const view = await render(row(1, false, first));
  await view.rerender(row(1, true, first));
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  await view.rerender(row(2, false, jest.fn()));
  expect(first).toHaveBeenCalledTimes(1);
});
