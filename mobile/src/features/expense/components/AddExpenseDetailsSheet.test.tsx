import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { DetailsFormState } from '@/features/expense/detailsFormReducer';
import { initI18n } from '@/i18n';

import { AddExpenseDetailsSheet } from './AddExpenseDetailsSheet';
import { testMembers } from './testMembers';

describe('AddExpenseDetailsSheet', () => {
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
      <AddExpenseDetailsSheet members={testMembers} onSubmit={jest.fn(async () => true)} />,
    );
    expect(screen.getByTestId('details-done').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('expense-name-input'), '   ');
    expect(screen.getByTestId('details-done').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('expense-name-input'), 'Dinner');
    expect(screen.getByTestId('details-done').props.accessibilityState.disabled).toBe(false);
  });

  it('submits the form state and dismisses on success', async () => {
    const onSubmit = jest.fn(async (_state: DetailsFormState) => true);
    const screen = await render(
      <AddExpenseDetailsSheet members={testMembers} initialCategory="COFFEE" onSubmit={onSubmit} />,
    );
    await fireEvent.changeText(screen.getByTestId('expense-name-input'), 'Dinner');
    await fireEvent.press(screen.getByTestId('share-chip-2'));
    await fireEvent.press(screen.getByTestId('payer-chip-1'));
    await fireEvent.press(screen.getByTestId('details-done'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      name: 'Dinner',
      category: 'COFFEE',
      shareMode: { type: 'members', ids: [2] },
      paidBy: { type: 'member', userId: 1 },
    });
    await waitFor(() => expect(dismissSpy).toHaveBeenCalledTimes(1));
    // Form resets so the next presentation starts clean.
    await waitFor(() => expect(screen.getByTestId('expense-name-input').props.value).toBe(''));
  });

  it('stays open with the input intact when onSubmit resolves false', async () => {
    const onSubmit = jest.fn(async () => false);
    const screen = await render(
      <AddExpenseDetailsSheet members={testMembers} onSubmit={onSubmit} />,
    );
    await fireEvent.changeText(screen.getByTestId('expense-name-input'), 'Taxi');
    await fireEvent.press(screen.getByTestId('details-done'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('details-done').props.accessibilityState.busy).toBe(false),
    );
    expect(dismissSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('expense-name-input').props.value).toBe('Taxi');
    expect(screen.getByTestId('details-done').props.accessibilityState.disabled).toBe(false);
  });

  it('changes the category through the nested picker', async () => {
    const onSubmit = jest.fn(async (_state: DetailsFormState) => true);
    const screen = await render(
      <AddExpenseDetailsSheet members={testMembers} onSubmit={onSubmit} />,
    );
    await fireEvent.press(screen.getByTestId('category-option-SPA'));
    await fireEvent.changeText(screen.getByTestId('expense-name-input'), 'Massage');
    await fireEvent.press(screen.getByTestId('details-done'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ category: 'SPA' });
  });
});
