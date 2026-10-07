import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { initI18n } from '@/i18n';

const mockRouterBack = jest.fn();
jest.mock('expo-router', () => ({ router: { back: () => mockRouterBack() } }));

let mockWalletData: { publicKey: string | null } | undefined = { publicKey: 'ADDR1234567890' };
jest.mock('../api/queries', () => ({
  useWallet: () => ({ data: mockWalletData, isLoading: false }),
}));

const mockIsVaultWalletConfigured = jest.fn(() => true);
const mockVaultWalletKind = jest.fn<'privy' | 'mwa' | null, []>(() => 'privy');
jest.mock('../wallet/walletHandle', () => ({
  isVaultWalletConfigured: () => mockIsVaultWalletConfigured(),
  vaultWalletKind: () => mockVaultWalletKind(),
  connectedVaultWalletAddress: () => null,
  connectVaultWallet: jest.fn(),
  resetVaultWallet: jest.fn(),
  subscribeWalletHandle: () => () => undefined,
}));

const mockEnsureWalletLinked = jest.fn(async () => undefined);
jest.mock('../wallet/authBootstrap', () => ({
  ensureWalletLinked: () => mockEnsureWalletLinked(),
}));

// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import { DepositToOnePlanWalletSheet } from './DepositToOnePlanWalletSheet';

/** `SafeAreaProvider` never measures under Jest, so the screen needs seeded metrics. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

describe('DepositToOnePlanWalletSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockWalletData = { publicKey: 'ADDR1234567890' };
    mockRouterBack.mockClear();
    mockEnsureWalletLinked.mockClear();
    mockIsVaultWalletConfigured.mockReturnValue(true);
    mockVaultWalletKind.mockReturnValue('privy');
  });

  it('on Android shows the Connect card when no wallet is linked', async () => {
    mockWalletData = { publicKey: null };
    mockVaultWalletKind.mockReturnValue('mwa');
    const screen = await render(<DepositToOnePlanWalletSheet />, { wrapper });
    await waitFor(() => expect(screen.getByTestId('connect-wallet-button')).toBeTruthy());
  });

  it('on Android shows the deposit QR, not the Connect card, once a wallet is linked', async () => {
    mockVaultWalletKind.mockReturnValue('mwa');
    const screen = await render(<DepositToOnePlanWalletSheet />, { wrapper });
    await waitFor(() => expect(screen.getByTestId('wallet-deposit-copy')).toBeTruthy());
    expect(screen.queryByTestId('connect-wallet-card')).toBeNull();
  });

  it('shows the deposit copy and a QR once the address loads', async () => {
    const screen = await render(<DepositToOnePlanWalletSheet />, { wrapper });
    await waitFor(() => expect(screen.getByText('Go back')).toBeTruthy());
    expect(screen.getByText('OnePlan Wallet')).toBeTruthy();
    expect(mockEnsureWalletLinked).toHaveBeenCalledTimes(1);
  });

  it('shows the receive copy in receive mode', async () => {
    const screen = await render(<DepositToOnePlanWalletSheet mode="receive" />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText('Receive USDC on Solana to your OnePlan Wallet')).toBeTruthy(),
    );
  });

  it('fires onBack from the Go back button', async () => {
    const onBack = jest.fn();
    const screen = await render(<DepositToOnePlanWalletSheet onBack={onBack} />, { wrapper });
    await waitFor(() => expect(screen.getByText('Go back')).toBeTruthy());
    await fireEvent.press(screen.getByText('Go back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows only a Go back button when no wallet is linked yet', async () => {
    mockWalletData = { publicKey: null };
    const screen = await render(<DepositToOnePlanWalletSheet />, { wrapper });
    await waitFor(() => expect(screen.getByText('Go back')).toBeTruthy());
    expect(screen.queryByText('Solana')).toBeNull();
  });

  it('skips ensureWalletLinked when the wallet is not configured', async () => {
    mockIsVaultWalletConfigured.mockReturnValue(false);
    await render(<DepositToOnePlanWalletSheet />, { wrapper });
    await waitFor(() => expect(mockEnsureWalletLinked).not.toHaveBeenCalled());
  });
});
