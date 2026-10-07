import { render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { useUsesMwa } from '../web3Flag';
import { VaultWalletProvider } from './VaultWalletProvider';

jest.mock('../web3Flag', () => ({ useUsesMwa: jest.fn() }));
jest.mock('./mwa/MwaVaultProvider', () => {
  const { Text: T } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MwaVaultProvider: () => <T>mwa-provider</T> };
});
jest.mock('./PrivyVaultProvider', () => {
  const { Text: T } = jest.requireActual<typeof import('react-native')>('react-native');
  return { PrivyVaultProvider: () => <T>privy-provider</T> };
});

const mounts = jest.fn();
function Probe() {
  useEffect(() => {
    mounts();
  }, []);
  return <Text>app</Text>;
}

beforeEach(() => mounts.mockClear());

describe('VaultWalletProvider', () => {
  it('mounts the MWA provider when the server picks MWA', async () => {
    jest.mocked(useUsesMwa).mockReturnValue(true);
    await render(
      <VaultWalletProvider>
        <Probe />
      </VaultWalletProvider>,
    );
    expect(screen.getByText('mwa-provider')).toBeTruthy();
    expect(screen.queryByText('privy-provider')).toBeNull();
  });

  it('mounts the Privy provider otherwise', async () => {
    jest.mocked(useUsesMwa).mockReturnValue(false);
    await render(
      <VaultWalletProvider>
        <Probe />
      </VaultWalletProvider>,
    );
    expect(screen.getByText('privy-provider')).toBeTruthy();
    expect(screen.queryByText('mwa-provider')).toBeNull();
  });

  it('swaps the provider without remounting the app below it', async () => {
    jest.mocked(useUsesMwa).mockReturnValue(false);
    const view = await render(
      <VaultWalletProvider>
        <Probe />
      </VaultWalletProvider>,
    );
    jest.mocked(useUsesMwa).mockReturnValue(true);
    await view.rerender(
      <VaultWalletProvider>
        <Probe />
      </VaultWalletProvider>,
    );
    expect(screen.getByText('mwa-provider')).toBeTruthy();
    expect(screen.getByText('app')).toBeTruthy();
    expect(mounts).toHaveBeenCalledTimes(1);
  });
});
