import { render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

// eslint-disable-next-line import/first -- must follow the jest.mock hoist target
import { VaultDepositResultScreen } from './VaultDepositResultScreen';
// eslint-disable-next-line import/first
import type { VaultDepositFlow } from '../vaultDepositFlowStore';

const processingFlow: VaultDepositFlow = {
  amountMicro: 5_000_000n,
  recipient: '9RqQabcdefghijklmnopDzQi',
  status: 'processing',
  signature: '',
  date: new Date('2026-01-15T10:30:00Z').getTime(),
};

describe('VaultDepositResultScreen', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders nothing when there is no flow (store empty, no prop)', async () => {
    const screen = await render(<VaultDepositResultScreen />);
    expect(screen.toJSON()).toBeNull();
  });

  it('shows Processing, no explorer link, and no Deposit-again CTA while processing', async () => {
    const screen = await render(<VaultDepositResultScreen flow={processingFlow} />);
    expect(screen.getByText('Processing')).toBeTruthy();
    expect(screen.getByText('$5')).toBeTruthy();
    expect(screen.queryByText('Check on explorer')).toBeNull();
    expect(screen.queryByText('Deposit again')).toBeNull();
    expect(screen.getByText('…')).toBeTruthy(); // Transaction ID placeholder
  });

  it('shows Completed with the explorer link and Deposit-again CTA once signed', async () => {
    const completedFlow: VaultDepositFlow = {
      ...processingFlow,
      status: 'completed',
      signature: 'h42fjh24abcdefghijklmnop',
    };
    const screen = await render(<VaultDepositResultScreen flow={completedFlow} />);
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Check on explorer')).toBeTruthy();
    expect(screen.getByText('Deposit again')).toBeTruthy();
  });
});
