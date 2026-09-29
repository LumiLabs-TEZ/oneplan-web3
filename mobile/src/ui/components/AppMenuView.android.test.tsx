import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import {
  AppMenuView,
  menuPlacement,
  menuSections,
  type AppMenuAction,
} from './AppMenuView.android';

const actions: AppMenuAction[] = [
  {
    id: 'group-0',
    title: '',
    displayInline: true,
    subactions: [
      { id: 'none', title: 'None', state: 'on' },
      { id: 'short', title: '1-3 days', state: 'off' },
    ],
  },
  {
    id: 'group-1',
    title: '',
    displayInline: true,
    subactions: [{ id: 'delete', title: 'Delete trip', attributes: { destructive: true } }],
  },
];

/** `SafeAreaProvider` never measures under Jest. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 40, left: 0, right: 0, bottom: 20 },
};

interface Fiber {
  stateNode?: { measureInWindow?: jest.Mock } | null;
  return: Fiber | null;
}

/**
 * The trigger's ref is the mocked native view class (its `measureInWindow` is a no-op `jest.fn`);
 * walk up from the host element to it and answer like a real layout pass.
 */
function stubAnchor(testID: string) {
  let fiber: Fiber | null = (screen.getByTestId(testID) as unknown as { unstable_fiber: Fiber })
    .unstable_fiber;
  while (fiber && !jest.isMockFunction(fiber.stateNode?.measureInWindow)) fiber = fiber.return;
  fiber!.stateNode!.measureInWindow!.mockImplementation((cb: (...n: number[]) => void) =>
    cb(20, 100, 120, 32),
  );
}

async function openMenu(onPressAction = jest.fn()) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppMenuView actions={actions} onPressAction={onPressAction} testID="menu">
        <Text>Duration</Text>
      </AppMenuView>
    </SafeAreaProvider>,
  );
  stubAnchor('menu');
  await fireEvent.press(screen.getByTestId('menu'));
  return onPressAction;
}

describe('menuSections', () => {
  it('splits inline groups into sections and keeps loose actions together', () => {
    expect(
      menuSections([
        { id: 'a', title: 'A' },
        { id: 'g', title: '', displayInline: true, subactions: [{ id: 'b', title: 'B' }] },
        { id: 'c', title: 'C' },
      ]).map((s) => s.map((a) => a.id)),
    ).toEqual([['a'], ['b'], ['c']]);
  });
});

describe('menuPlacement', () => {
  const screenSize = { width: 400, height: 800, top: 40, bottom: 20 };

  it('drops below the trigger, left-aligned', () => {
    expect(
      menuPlacement(
        { x: 20, y: 100, width: 120, height: 32 },
        { width: 250, height: 200 },
        screenSize,
      ),
    ).toEqual({ left: 20, top: 138, fromTop: true, fromLeft: true });
  });

  it('flips above near the bottom and right-aligns near the right edge', () => {
    expect(
      menuPlacement(
        { x: 340, y: 700, width: 40, height: 40 },
        { width: 250, height: 200 },
        screenSize,
      ),
    ).toEqual({ left: 130, top: 494, fromTop: false, fromLeft: false });
  });
});

describe('AppMenuView (Android)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('opens on press with a checkmark only on the selected row', async () => {
    await openMenu();
    expect(screen.getByText('None')).toBeOnTheScreen();
    expect(screen.getByTestId('menu-item-none').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('menu-item-short').props.accessibilityState.checked).toBe(false);
  });

  it('colours destructive rows red', async () => {
    await openMenu();
    expect(StyleSheet.flatten(screen.getByText('Delete trip').props.style).color).toBe('#FF3B30');
  });

  it('reports the picked id after closing', async () => {
    const onPressAction = await openMenu();
    await fireEvent.press(screen.getByTestId('menu-item-short'));
    expect(onPressAction).not.toHaveBeenCalled();
    await act(() => jest.runAllTimers());
    expect(onPressAction).toHaveBeenCalledWith({ nativeEvent: { event: 'short' } });
    expect(screen.queryByText('1-3 days')).toBeNull();
  });

  it('closes on a backdrop tap without picking', async () => {
    const onPressAction = await openMenu();
    await fireEvent.press(screen.getByTestId('menu-backdrop'));
    await act(() => jest.runAllTimers());
    expect(onPressAction).not.toHaveBeenCalled();
    expect(screen.queryByText('None')).toBeNull();
  });
});
