import { fireEvent, render } from '@testing-library/react-native';
import { useReducer } from 'react';

import { detailsFormReducer, initialDetailsForm } from '@/features/expense/detailsFormReducer';
import { initI18n } from '@/i18n';

import { ExpenseFormFields } from './ExpenseFormFields';
import { testMembers } from './testMembers';

function Harness({ onPickCategory = jest.fn() }: { onPickCategory?: () => void }) {
  const [state, dispatch] = useReducer(detailsFormReducer, initialDetailsForm());
  return (
    <ExpenseFormFields
      state={state}
      dispatch={dispatch}
      members={testMembers}
      onPickCategory={onPickCategory}
    />
  );
}

function selected(screen: Awaited<ReturnType<typeof render>>, testID: string): boolean {
  return screen.getByTestId(testID).props.accessibilityState.selected as boolean;
}

describe('ExpenseFormFields', () => {
  beforeAll(() => {
    initI18n();
  });

  it('only renders accepted members as chips', async () => {
    const screen = await render(<Harness />);
    expect(screen.getByTestId('share-chip-1')).toBeTruthy();
    expect(screen.getByTestId('share-chip-2')).toBeTruthy();
    expect(screen.queryByTestId('share-chip-3')).toBeNull();
    expect(screen.queryByTestId('payer-chip-3')).toBeNull();
  });

  it('starts on All; tapping a member selects only that member; deselecting falls back to All', async () => {
    const screen = await render(<Harness />);
    // Like iOS, only the All chip lights up under "All" (members aren't individually picked).
    expect(selected(screen, 'share-chip-all')).toBe(true);
    expect(selected(screen, 'share-chip-1')).toBe(false);
    expect(selected(screen, 'share-chip-2')).toBe(false);

    await fireEvent.press(screen.getByTestId('share-chip-1'));
    expect(selected(screen, 'share-chip-all')).toBe(false);
    expect(selected(screen, 'share-chip-1')).toBe(true);
    expect(selected(screen, 'share-chip-2')).toBe(false);

    await fireEvent.press(screen.getByTestId('share-chip-1'));
    expect(selected(screen, 'share-chip-all')).toBe(true);
    expect(selected(screen, 'share-chip-1')).toBe(false);
  });

  it('tapping All clears the individual picks', async () => {
    const screen = await render(<Harness />);
    await fireEvent.press(screen.getByTestId('share-chip-2'));
    expect(selected(screen, 'share-chip-2')).toBe(true);
    await fireEvent.press(screen.getByTestId('share-chip-all'));
    expect(selected(screen, 'share-chip-all')).toBe(true);
    expect(selected(screen, 'share-chip-2')).toBe(false);
  });

  it('switches the payer between Group and a member', async () => {
    const screen = await render(<Harness />);
    expect(selected(screen, 'payer-chip-group')).toBe(true);
    await fireEvent.press(screen.getByTestId('payer-chip-2'));
    expect(selected(screen, 'payer-chip-group')).toBe(false);
    expect(selected(screen, 'payer-chip-2')).toBe(true);
    expect(selected(screen, 'payer-chip-1')).toBe(false);
    await fireEvent.press(screen.getByTestId('payer-chip-group'));
    expect(selected(screen, 'payer-chip-group')).toBe(true);
    expect(selected(screen, 'payer-chip-2')).toBe(false);
  });

  it('edits the name and opens the category picker', async () => {
    const onPickCategory = jest.fn();
    const screen = await render(<Harness onPickCategory={onPickCategory} />);
    await fireEvent.changeText(screen.getByTestId('expense-name-input'), 'Lunch');
    expect(screen.getByTestId('expense-name-input').props.value).toBe('Lunch');
    await fireEvent.press(screen.getByTestId('category-row'));
    expect(onPickCategory).toHaveBeenCalledTimes(1);
  });
});
