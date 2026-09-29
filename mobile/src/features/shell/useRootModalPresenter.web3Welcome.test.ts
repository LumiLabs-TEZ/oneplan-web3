import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import { useAuthStore } from '@/auth/authStore';
import { useTripWalletWelcomeStore } from '@/features/vault/tripWalletWelcomeStore';

import { resetRootModalPresenter } from './rootModals';
import { useRootModalPresenter } from './useRootModalPresenter';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock('@/native/versionGate', () => ({ useVersionGateBlocked: () => false }));
jest.mock('@/features/subscription/useFreeTrialEligibility', () => ({
  useFreeTrialEligibility: () => false,
  markFreeTrialShown: jest.fn(),
}));
jest.mock('@/features/me/useMe', () => ({ useMe: () => ({ data: { id: 42 } }) }));

let mockWeb3Enabled = true;
jest.mock('@/features/vault/web3Flag', () => ({ useWeb3Enabled: () => mockWeb3Enabled }));
let mockHasPrivyIds = true;
jest.mock('@/features/vault/wallet/walletConfig', () => ({ hasPrivyIds: () => mockHasPrivyIds }));

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useRootModalPresenter(), { wrapper });
}

beforeEach(() => {
  mockPush.mockClear();
  mockWeb3Enabled = true;
  mockHasPrivyIds = true;
  resetRootModalPresenter();
  useTripWalletWelcomeStore.setState({ seenUserIds: [] });
  useAuthStore.setState({ status: 'authed' });
});

describe('useRootModalPresenter — web3 welcome', () => {
  it('presents the welcome sheet when web3 is on and Privy is configured', async () => {
    await mount();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/web3-welcome'));
  });

  it('never presents it when the wallet cannot be set up (no Privy ids)', async () => {
    mockHasPrivyIds = false;
    await mount();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('never presents it when the web3 flag is off', async () => {
    mockWeb3Enabled = false;
    await mount();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
