/**
 * Port of the payer/share/name behaviours in `VaultExpenseSheet.swift` (`feat/web3-version`).
 */
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { testMembers } from '@/features/expense/components/testMembers';
import { initI18n } from '@/i18n';

import { VaultExpenseSheet, type VaultExpenseDetails } from './VaultExpenseSheet';

describe('VaultExpenseSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('defaults to Group payer, COFFEE category, and share-with-all', async () => {
    const onDone = jest.fn();
    const screen = await render(
      <VaultExpenseSheet members={testMembers} onDone={onDone} />,
    );
    await fireEvent.press(screen.getByTestId('vault-expense-done'));
    expect(onDone).toHaveBeenCalledWith<[VaultExpenseDetails]>({
      name: 'Coffee',
      category: 'COFFEE',
      payer: 'VAULT',
      shareWithUserIds: [],
    });
  });

  it('blank name falls back to the category title, not to fallbackName, when fallbackName is empty', async () => {
    const onDone = jest.fn();
    const screen = await render(<VaultExpenseSheet members={testMembers} onDone={onDone} />);
    await fireEvent.press(screen.getByTestId('vault-expense-done'));
    expect(onDone.mock.calls[0]?.[0].name).toBe('Coffee');
  });

  it('blank name falls back to fallbackName when given', async () => {
    const onDone = jest.fn();
    const screen = await render(
      <VaultExpenseSheet members={testMembers} fallbackName="Nguyen Van A" onDone={onDone} />,
    );
    await fireEvent.press(screen.getByTestId('vault-expense-done'));
    expect(onDone.mock.calls[0]?.[0].name).toBe('Nguyen Van A');
  });

  it('a typed name wins over both the category title and fallbackName', async () => {
    const onDone = jest.fn();
    const screen = await render(
      <VaultExpenseSheet members={testMembers} fallbackName="Nguyen Van A" onDone={onDone} />,
    );
    await fireEvent.changeText(screen.getByTestId('vault-expense-name'), 'Weekend groceries');
    await fireEvent.press(screen.getByTestId('vault-expense-done'));
    expect(onDone.mock.calls[0]?.[0].name).toBe('Weekend groceries');
  });

  it('choosing Me sets payer to PERSONAL and shows the wallet hint', async () => {
    const onDone = jest.fn();
    const screen = await render(
      <VaultExpenseSheet members={testMembers} personalBalanceUsdc={12.5} onDone={onDone} />,
    );
    await fireEvent.press(screen.getByTestId('vault-expense-payer-me'));
    expect(screen.getByText('My wallet: $12.50')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vault-expense-done'));
    expect(onDone.mock.calls[0]?.[0].payer).toBe('PERSONAL');
  });

  it('selecting specific members sends only their ids; only accepted members are offered', async () => {
    const onDone = jest.fn();
    const screen = await render(<VaultExpenseSheet members={testMembers} onDone={onDone} />);
    expect(screen.queryByTestId('vault-expense-share-3')).toBeNull(); // Pending — excluded
    await fireEvent.press(screen.getByTestId('vault-expense-share-2'));
    await fireEvent.press(screen.getByTestId('vault-expense-done'));
    expect(onDone.mock.calls[0]?.[0].shareWithUserIds).toEqual([2]);
  });

  it('deselecting the last picked member falls back to "All" (empty array)', async () => {
    const onDone = jest.fn();
    const screen = await render(<VaultExpenseSheet members={testMembers} onDone={onDone} />);
    await fireEvent.press(screen.getByTestId('vault-expense-share-2'));
    await fireEvent.press(screen.getByTestId('vault-expense-share-2'));
    await fireEvent.press(screen.getByTestId('vault-expense-done'));
    expect(onDone.mock.calls[0]?.[0].shareWithUserIds).toEqual([]);
  });

  it('tapping "All" after picking specific members clears the selection', async () => {
    const onDone = jest.fn();
    const screen = await render(<VaultExpenseSheet members={testMembers} onDone={onDone} />);
    await fireEvent.press(screen.getByTestId('vault-expense-share-2'));
    await fireEvent.press(screen.getByTestId('vault-expense-share-all'));
    await fireEvent.press(screen.getByTestId('vault-expense-done'));
    expect(onDone.mock.calls[0]?.[0].shareWithUserIds).toEqual([]);
  });

  it('opens the category picker and applies the selected category', async () => {
    const onDone = jest.fn();
    const screen = await render(<VaultExpenseSheet members={testMembers} onDone={onDone} />);
    await fireEvent.press(screen.getByTestId('vault-expense-category-button'));
    await waitFor(() => expect(screen.getByTestId('vault-category-picker-sheet')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('vault-category-option-FOOD'));
    await fireEvent.press(screen.getByTestId('vault-expense-done'));
    expect(onDone.mock.calls[0]?.[0].category).toBe('FOOD');
  });

  it('shows the Paying… overlay and refuses a second Done while a payment is in flight', async () => {
    const onDone = jest.fn();
    const screen = await render(
      <VaultExpenseSheet members={testMembers} isWorking onDone={onDone} />,
    );
    expect(screen.getByTestId('vault-expense-working')).toBeTruthy();
    expect(screen.getByText('Paying…')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vault-expense-done'));
    expect(onDone).not.toHaveBeenCalled();
  });

  it('has no overlay when idle', async () => {
    const screen = await render(<VaultExpenseSheet members={testMembers} onDone={jest.fn()} />);
    expect(screen.queryByTestId('vault-expense-working')).toBeNull();
  });
});
