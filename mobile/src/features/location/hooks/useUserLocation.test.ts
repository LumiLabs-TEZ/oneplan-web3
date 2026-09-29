import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { useUserLocation } from './useUserLocation';

describe('useUserLocation', () => {
  // The `expo-location` mock in `jest.setup.ts` is a persistent `jest.fn()`,
  // not a real module export — `jest.spyOn` on it just returns the same mock,
  // so `.mockResolvedValue`/`.mockRejectedValue` permanently overwrite its
  // default implementation and `restoreAllMocks` cannot undo that. Use the
  // `*Once` variants so each test's override doesn't leak into the next.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves coords once permission is granted (jest.setup.ts default mock)', async () => {
    const { result } = await renderHook(() => useUserLocation());
    await act(async () => undefined);
    expect(result.current.loading).toBe(false);
    expect(result.current.denied).toBe(false);
    expect(result.current.coords).toEqual({ latitude: 10.77, longitude: 106.7 });
  });

  it('marks denied when the permission prompt is declined, without fetching a fix', async () => {
    jest.spyOn(Location, 'requestForegroundPermissionsAsync').mockResolvedValueOnce({
      status: 'denied',
      granted: false,
      canAskAgain: true,
      expires: 'never',
    } as never);
    const getCurrent = jest.spyOn(Location, 'getCurrentPositionAsync');

    const { result } = await renderHook(() => useUserLocation());
    await act(async () => undefined);

    expect(result.current.loading).toBe(false);
    expect(result.current.denied).toBe(true);
    expect(result.current.coords).toBeNull();
    expect(getCurrent).not.toHaveBeenCalled();
  });

  it('marks denied when fetching the fix throws after permission is granted', async () => {
    jest.spyOn(Location, 'getCurrentPositionAsync').mockRejectedValueOnce(new Error('no fix'));

    const { result } = await renderHook(() => useUserLocation());
    await act(async () => undefined);

    expect(result.current.loading).toBe(false);
    expect(result.current.denied).toBe(true);
    expect(result.current.coords).toBeNull();
  });

  it('requests permission with Balanced accuracy', async () => {
    await renderHook(() => useUserLocation());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({
      accuracy: Location.Accuracy.Balanced,
    });
  });
});
