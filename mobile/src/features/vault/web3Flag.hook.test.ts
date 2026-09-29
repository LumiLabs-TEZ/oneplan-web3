import { renderHook } from '@testing-library/react-native';

import { useAuthStore } from '@/auth/authStore';

import { useWeb3Enabled, useWeb3FlagStore } from './web3Flag';

let mockEligibility: { eligible: boolean; hasWeb3Trip: boolean } | undefined;
jest.mock('./api/eligibility', () => ({
  useWeb3Eligibility: () => ({ data: mockEligibility }),
}));
let mockTrip: { web3: boolean } | undefined;
jest.mock('@/features/trip/api/queries', () => ({ useTrip: () => ({ data: mockTrip }) }));
jest.mock('@/lib/env', () => ({ env: { variant: 'dev' } }));

beforeEach(() => {
  mockEligibility = undefined;
  mockTrip = undefined;
  useWeb3FlagStore.setState({ override: null });
  useAuthStore.setState({ status: 'authed' });
});

describe('useWeb3Enabled (server truth)', () => {
  it('is OFF while the server has not answered or web3 is dark server-side', async () => {
    expect((await renderHook(() => useWeb3Enabled())).result.current).toBe(false);
    mockEligibility = { eligible: false, hasWeb3Trip: false };
    expect((await renderHook(() => useWeb3Enabled())).result.current).toBe(false);
  });

  it('is ON for an eligible account, OFF again when the dev override says off', async () => {
    mockEligibility = { eligible: true, hasWeb3Trip: false };
    expect((await renderHook(() => useWeb3Enabled())).result.current).toBe(true);
    useWeb3FlagStore.setState({ override: false });
    expect((await renderHook(() => useWeb3Enabled())).result.current).toBe(false);
  });

  it('a trip surface needs trip.web3 as well', async () => {
    mockEligibility = { eligible: true, hasWeb3Trip: false };
    mockTrip = { web3: false };
    expect((await renderHook(() => useWeb3Enabled(7))).result.current).toBe(false);
    mockTrip = { web3: true };
    expect((await renderHook(() => useWeb3Enabled(7))).result.current).toBe(true);
  });

  it('a non-eligible (VN) member of a web3 trip gets no web3 UI on the trip', async () => {
    mockEligibility = { eligible: false, hasWeb3Trip: true };
    mockTrip = { web3: true };
    expect((await renderHook(() => useWeb3Enabled(7))).result.current).toBe(false);
    expect((await renderHook(() => useWeb3Enabled())).result.current).toBe(false);
  });
});
