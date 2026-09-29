import { renderHook } from '@testing-library/react-native';

import { useTripHasVault } from './tripHasVault';

let mockBalanceState: { isSuccess: boolean; isPending: boolean; fetchStatus: string };

jest.mock('@/features/vault/api/queries', () => ({
  useVaultBalance: () => mockBalanceState,
}));

describe('useTripHasVault', () => {
  it('reports hasVault=true, isLoading=false once the balance check succeeds', async () => {
    mockBalanceState = { isSuccess: true, isPending: false, fetchStatus: 'idle' };
    const { result } = await renderHook(() => useTripHasVault(5));
    expect(result.current).toEqual({ hasVault: true, isLoading: false });
  });

  it('reports hasVault=false, isLoading=false once the check settles as an error (404 = no vault)', async () => {
    mockBalanceState = { isSuccess: false, isPending: false, fetchStatus: 'idle' };
    const { result } = await renderHook(() => useTripHasVault(5));
    expect(result.current).toEqual({ hasVault: false, isLoading: false });
  });

  it('reports isLoading=true while an enabled check is still in flight — never treats it as "no vault"', async () => {
    mockBalanceState = { isSuccess: false, isPending: true, fetchStatus: 'fetching' };
    const { result } = await renderHook(() => useTripHasVault(5, { enabled: true }));
    expect(result.current).toEqual({ hasVault: false, isLoading: true });
  });

  it('reports isLoading=false when the query is disabled, even though react-query calls that "pending"', async () => {
    mockBalanceState = { isSuccess: false, isPending: true, fetchStatus: 'idle' };
    const { result } = await renderHook(() => useTripHasVault(5, { enabled: false }));
    expect(result.current).toEqual({ hasVault: false, isLoading: false });
  });
});
