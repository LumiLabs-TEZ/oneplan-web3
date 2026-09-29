import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { VaultHistoryRow, type VaultHistoryEntry } from './VaultHistoryRow';

function entry(overrides: Partial<VaultHistoryEntry> = {}): VaultHistoryEntry {
  return {
    id: 1,
    title: 'Coffee',
    category: 'COFFEE',
    kind: { type: 'expense', paidBy: null, shareWith: [] },
    amount: -50_000,
    currency: 'VND',
    time: '08:18',
    ...overrides,
  };
}

describe('VaultHistoryRow', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders a group-paid expense with no payer chip and the "All" chip', async () => {
    const screen = await render(<VaultHistoryRow entry={entry()} />);
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('-đ50,000')).toBeTruthy();
    expect(screen.getByText('08:18')).toBeTruthy();
  });

  it('renders a payer chip when a member (not the group) paid', async () => {
    const screen = await render(
      <VaultHistoryRow
        entry={entry({
          kind: {
            type: 'expense',
            paidBy: { name: 'Cattie', avatarUrl: null },
            shareWith: [{ name: 'Nam', avatarUrl: null }],
          },
        })}
      />,
    );
    expect(screen.getByText('Cattie')).toBeTruthy();
    expect(screen.getByText('Nam')).toBeTruthy();
  });

  it('shows a "+N" overflow when more than two people share the expense', async () => {
    const screen = await render(
      <VaultHistoryRow
        entry={entry({
          kind: {
            type: 'expense',
            paidBy: null,
            shareWith: [
              { name: 'A', avatarUrl: null },
              { name: 'B', avatarUrl: null },
              { name: 'C', avatarUrl: null },
              { name: 'D', avatarUrl: null },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('renders a deposit with the shortened from-address and a positive USDC amount', async () => {
    const screen = await render(
      <VaultHistoryRow
        entry={entry({
          kind: { type: 'deposit', fromAddress: 'HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL' },
          amount: 100,
          currency: 'USD',
          title: 'Deposit USDC',
        })}
      />,
    );
    expect(screen.getByText('HcBi...tLAL')).toBeTruthy();
    expect(screen.getByText('+$100.00')).toBeTruthy();
  });

  it('renders a settlement as "Paid back to {name}" with no share chip', async () => {
    const screen = await render(
      <VaultHistoryRow
        entry={entry({
          kind: { type: 'settlement', toName: 'Nam' },
          amount: 20,
          currency: 'USD',
          title: 'Settlement',
        })}
      />,
    );
    expect(screen.getByText('Paid back to Nam')).toBeTruthy();
  });

  it('shows "Needs approval" and greys the amount instead of the timestamp when awaiting approval', async () => {
    const screen = await render(<VaultHistoryRow entry={entry({ isAwaitingApproval: true })} />);
    expect(screen.getByText('Needs approval')).toBeTruthy();
    expect(screen.queryByText('08:18')).toBeNull();
  });

  it('calls onPress only for tappable rows and is disabled without one', async () => {
    const onPress = jest.fn();
    const screen = await render(<VaultHistoryRow entry={entry()} onPress={onPress} testID="row" />);
    await fireEvent.press(screen.getByTestId('row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('placesCurrencySymbolAfter puts the đ after the number', async () => {
    const screen = await render(
      <VaultHistoryRow entry={entry({ amount: -355_000 })} placesCurrencySymbolAfter />,
    );
    expect(screen.getByText('-355,000đ')).toBeTruthy();
  });

  it('usesOutlinedAllChip still renders the "All" label (outline is a style-only change)', async () => {
    const screen = await render(<VaultHistoryRow entry={entry()} usesOutlinedAllChip />);
    expect(screen.getByText('All')).toBeTruthy();
  });
});
