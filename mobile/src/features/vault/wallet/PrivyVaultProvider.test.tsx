import { PrivyProvider } from '@privy-io/expo';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useWeb3FlagStore } from '../web3Flag';
import { PrivyVaultProvider } from './PrivyVaultProvider';
import { _resetWalletHandleForTests, isVaultWalletConfigured } from './walletHandle';

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
