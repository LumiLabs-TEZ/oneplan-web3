import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { VaultSettlementRow } from './VaultSettlementRow';
import type { VaultSettlementEntryModel } from '../helpers/tripEndSettlement';

function entry(over: Partial<VaultSettlementEntryModel> = {}): VaultSettlementEntryModel {
  return {
    id: 2,
    name: 'Shin',
    avatarUrls: [],
    extraCount: 0,
    direction: 'receiving',
    amount: 1_500_000,
    amountUsdc: 1.5,
    lines: [],
    state: 'outstanding',
    walletAddress: null,
    canConfirm: true,
    ...over,
  };
}

describe('VaultSettlementRow', () => {
  beforeAll(() => {
    initI18n();
  });

  it('is collapsed by default and expands on tap', async () => {
    const screen = await render(<VaultSettlementRow entry={entry()} />);
    expect(screen.queryByTestId('vault-settlement-mark-done')).toBeNull();
    await fireEvent.press(screen.getByTestId('vault-settlement-row-toggle'));
    expect(screen.getByTestId('vault-settlement-mark-done')).toBeTruthy();
  });

  it('shows Mark as done + Show QR when receiving', async () => {
    const screen = await render(<VaultSettlementRow entry={entry({ direction: 'receiving' })} />);
    await fireEvent.press(screen.getByTestId('vault-settlement-row-toggle'));
    expect(screen.getByText('Mark as done')).toBeTruthy();
    expect(screen.getByText('Show QR')).toBeTruthy();
  });

  it('shows Send when paying and the creditor has a linked wallet', async () => {
    const screen = await render(
      <VaultSettlementRow
        entry={entry({ direction: 'paying', walletAddress: 'abcdef123456', canConfirm: false })}
      />,
    );
    await fireEvent.press(screen.getByTestId('vault-settlement-row-toggle'));
    expect(screen.getByText('Send')).toBeTruthy();
    expect(screen.getByText(/Shin \(abcd...3456\)/)).toBeTruthy();
  });

  it('shows Mark as done for the classic settle-your-shares case (paying, no wallet, can confirm)', async () => {
    const screen = await render(
      <VaultSettlementRow
        entry={entry({ direction: 'paying', walletAddress: null, canConfirm: true })}
      />,
    );
    await fireEvent.press(screen.getByTestId('vault-settlement-row-toggle'));
    expect(screen.getByText('Mark as done')).toBeTruthy();
  });

  it('shows a waiting message when paying, no wallet, and the caller cannot confirm', async () => {
    const screen = await render(
      <VaultSettlementRow
        entry={entry({ direction: 'paying', walletAddress: null, canConfirm: false })}
      />,
    );
    await fireEvent.press(screen.getByTestId('vault-settlement-row-toggle'));
    expect(screen.getByText('Waiting for Shin to confirm')).toBeTruthy();
  });

  it('disables Mark as done when the caller is not the creditor (canConfirm false, receiving)', async () => {
    const screen = await render(
      <VaultSettlementRow entry={entry({ direction: 'receiving', canConfirm: false })} />,
    );
    await fireEvent.press(screen.getByTestId('vault-settlement-row-toggle'));
    expect(screen.getByTestId('vault-settlement-mark-done').props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('calls onMarkAsDone only when canConfirm is true', async () => {
    const onMarkAsDone = jest.fn();
    const screen = await render(
      <VaultSettlementRow entry={entry({ canConfirm: true })} onMarkAsDone={onMarkAsDone} />,
    );
    await fireEvent.press(screen.getByTestId('vault-settlement-row-toggle'));
    await fireEvent.press(screen.getByTestId('vault-settlement-mark-done'));
    expect(onMarkAsDone).toHaveBeenCalledTimes(1);
  });

  it('once settled, replaces the action row with a Success badge and no buttons', async () => {
    const screen = await render(<VaultSettlementRow entry={entry({ state: 'markedDone' })} />);
    expect(screen.getByText('Success')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vault-settlement-row-toggle'));
    expect(screen.queryByTestId('vault-settlement-mark-done')).toBeNull();
    expect(screen.queryByTestId('vault-settlement-show-qr')).toBeNull();
  });

  it('renders each line with its own USDC + VND amount', async () => {
    const screen = await render(
      <VaultSettlementRow
        entry={entry({
          lines: [
            { title: 'Lẩu bò Nhà Gỗ', amount: 26_500_000, amountUsdc: 1 },
            { title: 'Homestay', amount: 5_300_000, amountUsdc: 0.2 },
          ],
        })}
      />,
    );
    await fireEvent.press(screen.getByTestId('vault-settlement-row-toggle'));
    expect(screen.getByText('Lẩu bò Nhà Gỗ')).toBeTruthy();
    expect(screen.getByText('1.00 USDC')).toBeTruthy();
    expect(screen.getByText('Homestay')).toBeTruthy();
    expect(screen.getByText('0.20 USDC')).toBeTruthy();
  });
});
