/**
 * Regression: `RootLayout` once called `useWeb3Enabled()` (react-query) above its own
 * `QueryClientProvider` → red box "No QueryClient set" at launch. Unit tests missed it because they
 * mock the query layer. Here react-query, `web3Flag` and `eligibility` are REAL; only the native /
 * navigation / network edges are stubbed.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useAuthStore } from '@/auth/authStore';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: T } = require('react-native');
  const Stack = Object.assign(
    function Stack() {
      return <T>root-stack</T>;
    },
    {
      Screen: function Screen() {
        return null;
      },
      Protected: function Protected({ children }: { children?: ReactNode }) {
        return children ?? null;
      },
    },
  );
  // Reference mode (`receipt` segment) skips SessionEffects + splash; the navigator still mounts.
  return { Stack, useSegments: () => ['receipt'] };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children?: ReactNode }) => children,
}));
jest.mock('expo-share-intent', () => ({
  ShareIntentProvider: ({ children }: { children?: ReactNode }) => children,
}));
jest.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetModalProvider: ({ children }: { children?: ReactNode }) => children,
}));
jest.mock('@/features/vault/wallet/PrivyVaultProvider', () => ({
  PrivyVaultProvider: ({ children }: { children?: ReactNode }) => children,
}));
jest.mock('@/features/vault/wallet/authBootstrap', () => ({
  installVaultSignOutHook: jest.fn(),
  useWalletAuthBootstrap: jest.fn(),
}));
jest.mock('@/features/shell/AnimatedSplash', () => ({ AnimatedSplash: () => null }));
jest.mock('@/native/versionGate', () => ({ useVersionGate: () => null }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: () => () => undefined },
}));
jest.mock('@/push/backgroundTask', () => ({}));
jest.mock('@/features/vault/web3RootScreens', () => ({ web3RootScreens: () => null }));
jest.mock('@/api/client', () => ({
  api: { GET: jest.fn().mockResolvedValue({ data: { eligible: false, hasWeb3Trip: false } }) },
}));
// Session-level hooks are irrelevant here; they are covered by their own tests.
jest.mock('@/push/useBadgeClear', () => ({ useBadgeClear: jest.fn() }));

describe('RootLayout provider stack', () => {
  it('renders without "No QueryClient set" (query hooks live below the provider)', async () => {
    useAuthStore.setState({ status: 'authed' });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RootLayout = require('@/app/_layout').default;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await render(<RootLayout />);
      // Past the hydration `return null`, the navigator (and its query hooks) really mounted.
      expect(await screen.findByText('root-stack')).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
