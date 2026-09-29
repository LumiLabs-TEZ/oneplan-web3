import { PrivyProvider } from '@privy-io/expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Text } from 'react-native';

import { useWeb3FlagStore } from '../web3Flag';
import { PrivyVaultProvider } from './PrivyVaultProvider';
import { _resetWalletHandleForTests, isVaultWalletConfigured } from './walletHandle';

// The provider reads server eligibility through react-query, as it does under the real root layout.
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const mockedPrivyProvider = jest.mocked(PrivyProvider);

beforeEach(() => {
  useWeb3FlagStore.setState({ override: null });
});

afterEach(() => {
  _resetWalletHandleForTests();
  mockedPrivyProvider.mockClear();
});

describe('PrivyVaultProvider — unconfigured (default test env has no Privy app id)', () => {
  it('renders children directly without mounting the Privy SDK', async () => {
    await render(
      <PrivyVaultProvider>
        <Text>vault content</Text>
      </PrivyVaultProvider>,
    );

    expect(screen.getByText('vault content')).toBeTruthy();
    expect(mockedPrivyProvider).not.toHaveBeenCalled();
  });

  it('publishes a not-configured wallet handle', async () => {
    await render(
      <PrivyVaultProvider>
        <Text>vault content</Text>
      </PrivyVaultProvider>,
    );

    expect(isVaultWalletConfigured()).toBe(false);
  });
});

describe('PrivyVaultProvider — web3 flag OFF', () => {
  it('never mounts the Privy SDK even if ids were configured (flag gates first)', async () => {
    useWeb3FlagStore.getState().setOverride(false);

    await render(
      <PrivyVaultProvider>
        <Text>vault content</Text>
      </PrivyVaultProvider>,
    );

    expect(screen.getByText('vault content')).toBeTruthy();
    expect(mockedPrivyProvider).not.toHaveBeenCalled();
    expect(isVaultWalletConfigured()).toBe(false);
  });
});
