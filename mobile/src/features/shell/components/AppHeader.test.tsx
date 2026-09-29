import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { initI18n } from '@/i18n';

import { AppHeader } from './AppHeader';

const mockPresent = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useNavigation: () => ({ addListener: () => () => undefined }),
}));
jest.mock('@/features/me/useMe', () => ({ useMe: () => ({ data: undefined }) }));
let mockIsPro = false;
jest.mock('@/features/subscription/api/queries', () => ({ useIsPro: () => mockIsPro }));
jest.mock('@/features/market/components/RequestPlanSheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    RequestPlanSheet: React.forwardRef(function RequestPlanSheetStub(_: unknown, ref: unknown) {
      React.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: jest.fn() }));
      return null;
    }),
  };
});

/** `SafeAreaProvider` never measures under Jest, so the header needs seeded metrics. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

describe('AppHeader Request a plan', () => {
  beforeAll(() => {
    initI18n();
  });
  afterEach(() => {
    jest.clearAllMocks();
    mockIsPro = false;
  });

  it('sends free users to the paywall', async () => {
    const screen = await render(<AppHeader tab="market" />, { wrapper });
    await fireEvent.press(screen.getByTestId('header-request-plan'));
    expect(router.push).toHaveBeenCalledWith('/paywall');
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it('presents the sheet for Pro users', async () => {
    mockIsPro = true;
    const screen = await render(<AppHeader tab="market" />, { wrapper });
    await fireEvent.press(screen.getByTestId('header-request-plan'));
    expect(mockPresent).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
