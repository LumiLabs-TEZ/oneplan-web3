import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { BudgetFormState } from '@/features/budget/budgetFormReducer';
import { testMembers } from '@/features/expense/components/testMembers';
import { initI18n } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';

import { AddBudgetDetailsSheet } from './AddBudgetDetailsSheet';

describe('AddBudgetDetailsSheet', () => {
  let dismissSpy: jest.SpyInstance;

  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    dismissSpy = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
  });

  afterEach(() => {
    dismissSpy.mockRestore();
  });

  it('keeps Done disabled until a name is entered', async () => {
    const screen = await render(
      <AddBudgetDetailsSheet
        members={testMembers}
        perPersonAmount={1_000_000}
        currency={CURRENCIES.VND}
        currentBalance={13_000}
        onSubmit={jest.fn(async () => true)}
      />,
    );
    expect(screen.getByTestId('budget-details-done').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('budget-name-input'), '  ');
    expect(screen.getByTestId('budget-details-done').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('budget-name-input'), 'Hotel');
    expect(screen.getByTestId('budget-details-done').props.accessibilityState.disabled).toBe(false);
  });

  it('submits the resolved contributor ids ("all") and dismisses on success', async () => {
    const onSubmit = jest.fn(async (_state: BudgetFormState) => true);
    const screen = await render(
      <AddBudgetDetailsSheet
        members={testMembers}
        perPersonAmount={1_000_000}
        currency={CURRENCIES.VND}
        currentBalance={13_000}
        onSubmit={onSubmit}
      />,
    );
    await fireEvent.changeText(screen.getByTestId('budget-name-input'), 'Hotel');
    await fireEvent.press(screen.getByTestId('budget-details-done'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: 'Hotel', contributors: 'all' });
    await waitFor(() => expect(dismissSpy).toHaveBeenCalledTimes(1));
  });

  it('narrows the contributor selection when a single member chip is tapped', async () => {
    const onSubmit = jest.fn(async (_state: BudgetFormState) => true);
    const screen = await render(
      <AddBudgetDetailsSheet
        members={testMembers}
        perPersonAmount={1_000_000}
        currency={CURRENCIES.VND}
        currentBalance={13_000}
        onSubmit={onSubmit}
      />,
    );
    await fireEvent.changeText(screen.getByTestId('budget-name-input'), 'Hotel');
    await fireEvent.press(screen.getByTestId('contributor-chip-2'));
    await fireEvent.press(screen.getByTestId('budget-details-done'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: 'Hotel', contributors: { ids: [2] } });
  });

  it('stays open with the input intact when onSubmit resolves false', async () => {
    const onSubmit = jest.fn(async () => false);
    const screen = await render(
      <AddBudgetDetailsSheet
        members={testMembers}
        perPersonAmount={1_000_000}
        currency={CURRENCIES.VND}
        currentBalance={13_000}
        onSubmit={onSubmit}
      />,
    );
    await fireEvent.changeText(screen.getByTestId('budget-name-input'), 'Taxi fund');
    await fireEvent.press(screen.getByTestId('budget-details-done'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(dismissSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('budget-name-input').props.value).toBe('Taxi fund');
  });
});
