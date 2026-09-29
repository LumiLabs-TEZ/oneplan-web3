import { renderHook } from '@testing-library/react-native';

import { useTripVaultCard } from './tripVaultCard';

let mockWeb3Enabled = true;
let mockBalance: { isSuccess: boolean; data?: { balanceMicro: string } };
const mockUseConvertedAmount = jest.fn();
const mockUseVaultBalance = jest.fn();

jest.mock('../web3Flag', () => ({ useWeb3Enabled: () => mockWeb3Enabled }));
jest.mock('./queries', () => ({
  useVaultBalance: (...args: unknown[]) => {
    mockUseVaultBalance(...args);
    return mockBalance;
  },
}));
jest.mock('@/features/exchange/useExchangeRate', () => ({
  useConvertedAmount: (...args: unknown[]) => mockUseConvertedAmount(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockWeb3Enabled = true;
  mockBalance = { isSuccess: false };
  mockUseConvertedAmount.mockReturnValue({ amount: null, rate: null, isStale: false });
});

describe('useTripVaultCard — flag off must equal develop (H1)', () => {
  it('flag OFF: no vault card, balance query disabled, and no USD source currency (so no /exchange-rates fetch)', async () => {
    mockWeb3Enabled = false;
    const { result } = await renderHook(() => useTripVaultCard(5, 'VND'));

    expect(result.current).toEqual({ hasVaultCard: false, balanceInHomeCurrency: 0 });
    expect(mockUseVaultBalance).toHaveBeenCalledWith(5, { enabled: false });
    expect(mockUseConvertedAmount).toHaveBeenCalledWith(0, null, 'VND');
  });

  it('flag ON but the trip has no vault (404): still no USD source currency', async () => {
    mockBalance = { isSuccess: false };
    const { result } = await renderHook(() => useTripVaultCard(5, 'VND'));

    expect(result.current.hasVaultCard).toBe(false);
    expect(mockUseConvertedAmount).toHaveBeenCalledWith(0, null, 'VND');
  });

  it('flag ON with a vault: converts the USDC balance from USD into the home currency', async () => {
    mockBalance = { isSuccess: true, data: { balanceMicro: '12500000' } };
    mockUseConvertedAmount.mockReturnValue({ amount: 330_000, rate: 26_400, isStale: false });
    const { result } = await renderHook(() => useTripVaultCard(5, 'VND'));

    expect(result.current).toEqual({ hasVaultCard: true, balanceInHomeCurrency: 330_000 });
    expect(mockUseConvertedAmount).toHaveBeenCalledWith(12.5, 'USD', 'VND');
  });
});
