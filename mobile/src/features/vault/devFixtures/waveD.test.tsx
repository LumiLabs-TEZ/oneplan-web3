import { act, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import DevVaultWaveDRoute from '@/app/(dev)/vault-wave-d';
import { initI18n } from '@/i18n';
import { formatWhole } from '@/lib/currency';

import {
  CASH_DEBTS,
  DEPOSIT_MICRO,
  REVIEW,
  SPENDS,
  TOTAL_SPENT_VND,
  microToVnd,
} from './waveD';
import { FALLBACK_USDC_TO_VND } from '../helpers/tripEndSettlement';

let mockScreen: string | undefined;
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ screen: mockScreen }),
}));

const mockExpoFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockExpoFetch(...args) }));

describe('(dev)/vault-wave-d gallery', () => {
  const globalFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeAll(() => {
    initI18n();
    global.fetch = globalFetch as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });
  beforeEach(() => {
    mockExpoFetch.mockReset();
    globalFetch.mockReset();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['review', 'waiting', 'denied', 'settlement'])(
    'renders the %s state without any network call or error alert',
    async (state) => {
      mockScreen = state;
      const view = await render(<DevVaultWaveDRoute />);
      // Let any query that (wrongly) fired on mount reach fetch / settle into an error.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(mockExpoFetch).not.toHaveBeenCalled();
      expect(globalFetch).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(screen.getByTestId('dev-vault-wave-d-screen')).toBeTruthy();
      view.unmount();
    },
  );

  it('review: history total is the sum of its rows and FX matches the app constant', async () => {
    mockScreen = 'review';
    await render(<DevVaultWaveDRoute />);

    const [debt] = CASH_DEBTS;
    if (!debt) throw new Error('fixture has no cash debt');
    expect(Number(debt.amountMicro)).toBe(
      debt.lines.reduce((sum, line) => sum + Number(line.amountMicro), 0),
    );
    // "Receive from Shin +1.50 USDC" is shown at the shared FX constant, not a live/stale rate.
    const vnd = (Number(debt.amountMicro) / 1_000_000) * FALLBACK_USDC_TO_VND;
    expect(screen.getByText(`+${formatWhole(vnd)}đ`)).toBeTruthy();
    // Each spend row's VND face value is its USDC debit at that same constant.
    for (const spend of SPENDS) {
      expect(screen.getByText(`-${formatWhole(microToVnd(spend.amountMicro))}đ`)).toBeTruthy();
    }
    expect(Number(REVIEW.balanceMicro)).toBe(
      DEPOSIT_MICRO - SPENDS.reduce((sum, spend) => sum + spend.amountMicro, 0),
    );
    expect(TOTAL_SPENT_VND).toBe(
      SPENDS.reduce((sum, spend) => sum + microToVnd(spend.amountMicro), 0),
    );
  });
});
