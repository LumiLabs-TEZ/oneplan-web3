import { act, render } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { initI18n } from '@/i18n';

import { ExpenseCategoryPickerSheet } from './ExpenseCategoryPickerSheet';

// Capture the props the picker hands its AppSheet so the test can drive `onChange`/`onDismiss`
// (the gorhom modal is mocked in Jest and never fires them itself).
const mockSheetProps = jest.fn();
const mockDismiss = jest.fn();
jest.mock('@/ui/components', () => {
  const actual = jest.requireActual('@/ui/components');
  const React = jest.requireActual('react');
  return {
    ...actual,
    AppSheet: React.forwardRef(function AppSheetSpy(
      props: Record<string, unknown>,
      ref: { current: unknown },
    ) {
      mockSheetProps(props);
      React.useImperativeHandle(ref, () => ({ dismiss: mockDismiss, present: jest.fn() }), []);
      return null;
    }),
  };
});

function lastProps() {
  return mockSheetProps.mock.calls[mockSheetProps.mock.calls.length - 1][0] as {
    onChange: (index: number) => void;
    onDismiss: () => void;
  };
}

describe('ExpenseCategoryPickerSheet hardware Back', () => {
  beforeAll(() => initI18n());
  beforeEach(() => {
    mockSheetProps.mockClear();
    mockDismiss.mockClear();
  });

  it('closes only the picker while open, then stops intercepting once dismissed', async () => {
    const listeners: (() => boolean)[] = [];
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((
      _: string,
      cb: () => boolean,
    ) => {
      listeners.push(cb);
      return { remove: () => listeners.splice(listeners.indexOf(cb), 1) };
    }) as never);

    await render(<ExpenseCategoryPickerSheet value="COFFEE" onSelect={jest.fn()} />);
    expect(listeners).toHaveLength(0);

    await act(async () => lastProps().onChange(0));
    expect(listeners).toHaveLength(1);
    expect(listeners[0]?.()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(1);

    await act(async () => lastProps().onDismiss());
    expect(listeners).toHaveLength(0);
    add.mockRestore();
  });
});
