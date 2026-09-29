import { renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useQuickActionHandler } from './useQuickActionHandler';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

let mockIsPro = false;
jest.mock('@/features/me/useMe', () => ({ useIsPro: () => mockIsPro }));

describe('useQuickActionHandler', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockIsPro = false;
  });

  it('closes the FAB before routing', async () => {
    const onClose = jest.fn();
    const { result } = await renderHook(() => useQuickActionHandler({ onClose }));
    result.current('scanQR');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/profile/invite',
      params: { scan: '1' },
    });
  });

  it('sends a free user tapping uploadTrip to the paywall (native bar has no PremiumGate)', async () => {
    const { result } = await renderHook(() => useQuickActionHandler({ onClose: jest.fn() }));
    result.current('uploadTrip');
    expect(router.push).toHaveBeenCalledWith('/paywall');
  });

  it('opens the creator editor for Pro', async () => {
    mockIsPro = true;
    const { result } = await renderHook(() => useQuickActionHandler({ onClose: jest.fn() }));
    result.current('uploadTrip');
    expect(router.push).toHaveBeenCalledWith('/market/editor');
  });
});
