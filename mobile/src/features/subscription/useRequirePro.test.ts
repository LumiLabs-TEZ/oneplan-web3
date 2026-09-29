import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useRequirePro } from './useRequirePro';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

let mockIsPro = false;
jest.mock('./api/queries', () => ({
  useIsPro: () => mockIsPro,
}));

describe('useRequirePro', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockIsPro = false;
  });

  it('pushes /paywall and does not run onAllowed when not Pro', async () => {
    mockIsPro = false;
    const { result } = await renderHook(() => useRequirePro());
    const onAllowed = jest.fn();

    await act(async () => result.current.requirePro(onAllowed));

    expect(router.push).toHaveBeenCalledWith('/paywall');
    expect(onAllowed).not.toHaveBeenCalled();
    expect(result.current.isPro).toBe(false);
  });

  it('runs onAllowed and does not navigate when Pro', async () => {
    mockIsPro = true;
    const { result } = await renderHook(() => useRequirePro());
    const onAllowed = jest.fn();

    await act(async () => result.current.requirePro(onAllowed));

    expect(onAllowed).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(result.current.isPro).toBe(true);
  });
});
