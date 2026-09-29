/**
 * Port of `CategoryPickerSheet.swift` (`feat/web3-version`): lists every category, marks the
 * current selection, and calls `onSelect` before dismissing.
 */
import { fireEvent, render } from '@testing-library/react-native';

import { EXPENSE_CATEGORIES } from '@/features/expense/categories';
import { initI18n } from '@/i18n';

import { sheetPresets } from '@/ui/components/sheetPresets';

import { CategoryPickerSheet } from './CategoryPickerSheet';

// Wraps the real AppSheet so the test can read which preset the picker asks for (the gorhom
// modal is mocked in Jest, so its `stackBehavior` is not observable from the rendered tree).
const mockAppSheetProps = jest.fn();
jest.mock('@/ui/components', () => {
  const actual = jest.requireActual('@/ui/components');
  const React = jest.requireActual('react');
  return {
    ...actual,
    AppSheet: React.forwardRef(function AppSheetSpy(props: { preset?: string }, ref: unknown) {
      mockAppSheetProps(props);
      return React.createElement(actual.AppSheet, { ...props, ref });
    }),
  };
});

describe('CategoryPickerSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('lists every category the API accepts (never a hand-rolled subset)', async () => {
    const screen = await render(
      <CategoryPickerSheet value="COFFEE" onSelect={jest.fn()} />,
    );
    for (const option of EXPENSE_CATEGORIES) {
      expect(screen.getByTestId(`vault-category-option-${option.value}`)).toBeTruthy();
    }
  });

  it('marks the current value as selected', async () => {
    const screen = await render(<CategoryPickerSheet value="SPA" onSelect={jest.fn()} />);
    expect(
      screen.getByTestId('vault-category-option-SPA').props.accessibilityState.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('vault-category-option-COFFEE').props.accessibilityState.selected,
    ).toBe(false);
  });

  it('calls onSelect with the tapped category', async () => {
    const onSelect = jest.fn();
    const screen = await render(<CategoryPickerSheet value="COFFEE" onSelect={onSelect} />);
    await fireEvent.press(screen.getByTestId('vault-category-option-GYM'));
    expect(onSelect).toHaveBeenCalledWith('GYM');
  });

  it('pushes over its parent sheet instead of minimising it (nested-sheet preset)', async () => {
    await render(<CategoryPickerSheet value="COFFEE" onSelect={jest.fn()} />);
    expect(mockAppSheetProps).toHaveBeenCalledWith(expect.objectContaining({ preset: 'nestedList' }));
    // ...and that preset is the repo's nested-sheet chrome (see `sheetPresets.ts`).
    expect(sheetPresets.nestedList).toMatchObject({
      stackBehavior: 'push',
      blurBackdrop: false,
      backdropOpacity: 0.12,
    });
  });
});
