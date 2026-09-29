import { render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';

import type { MemberBreakdownDto } from '../types';
import { MemberExpenseBreakdown } from './MemberExpenseBreakdown';

const mockUseConvertedAmount = jest.fn();
jest.mock('@/features/exchange/useExchangeRate', () => ({
  useConvertedAmount: (...args: unknown[]) => mockUseConvertedAmount(...args),
}));

function member(overrides: Partial<MemberBreakdownDto> = {}): MemberBreakdownDto {
  return {
    userId: 1,
    displayName: 'Me',
    avatarUrl: null,
    totalDeposit: 0,
    totalPaid: 0,
    totalShare: 300_000,
    netBalance: -50_000,
    isAllSettled: false,
    expenses: [],
    ...overrides,
  };
}

describe('MemberExpenseBreakdown — converted share caption', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockUseConvertedAmount.mockReset();
  });

  it('appends two decimal places for a decimal-places target currency (USD)', async () => {
    mockUseConvertedAmount.mockReturnValue({ amount: 99.99, rate: 1, isStale: false });

    const screen = await render(
      <MemberExpenseBreakdown
        member={member()}
        isCurrentUser={false}
        homeCurrency={CURRENCIES.VND}
        localCurrencyCode="USD"
      />,
    );

    expect(screen.getByRole('text', { name: '~99.99 USD' })).toBeTruthy();
  });

  it('omits decimals for a zero-decimal-places target currency (VND)', async () => {
    mockUseConvertedAmount.mockReturnValue({ amount: 99, rate: 1, isStale: false });

    const screen = await render(
      <MemberExpenseBreakdown
        member={member()}
        isCurrentUser={false}
        homeCurrency={CURRENCIES.USD}
        localCurrencyCode="VND"
      />,
    );

    expect(screen.getByRole('text', { name: '~99 VND' })).toBeTruthy();
  });

  it('renders no converted caption while the rate is unknown', async () => {
    mockUseConvertedAmount.mockReturnValue({ amount: null, rate: null, isStale: false });

    const screen = await render(
      <MemberExpenseBreakdown
        member={member()}
        isCurrentUser={false}
        homeCurrency={CURRENCIES.VND}
        localCurrencyCode="USD"
      />,
    );

    expect(screen.queryByText(/^~/)).toBeNull();
  });

  it('renders no converted caption when the local currency matches home', async () => {
    mockUseConvertedAmount.mockReturnValue({ amount: 300_000, rate: 1, isStale: false });

    const screen = await render(
      <MemberExpenseBreakdown
        member={member()}
        isCurrentUser={false}
        homeCurrency={CURRENCIES.VND}
        localCurrencyCode="VND"
      />,
    );

    expect(mockUseConvertedAmount).toHaveBeenCalledWith(300_000, 'VND', undefined);
    expect(screen.queryByText(/^~/)).toBeNull();
  });
});
