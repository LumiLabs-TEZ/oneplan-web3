import { act, renderHook } from '@testing-library/react-native';
import type { TFunction } from 'i18next';

import type { LatLng } from '@/features/plan/helpers/geo';

import { useDirections } from './useDirections';

// The user fix from jest.setup.ts's expo-location mock.
const userCoords: LatLng = { latitude: 10.77, longitude: 106.7 };
const place: LatLng = { latitude: 10.8, longitude: 106.75 };

const t: TFunction = ((_key: string, params: Record<number, unknown>) =>
  `${params[0]} min · ${params[1]}`) as unknown as TFunction;

describe('useDirections', () => {
  it('starts inactive with no model', async () => {
    const { result } = await renderHook(() => useDirections(place, 'en', t));
    expect(result.current.active).toBe(false);
    expect(result.current.model).toBeNull();
    expect(result.current.mode).toBe('walk');
  });

  it('start() resolves the user fix and builds the directions model', async () => {
    const { result } = await renderHook(() => useDirections(place, 'en', t));
    await act(async () => {
      result.current.start();
    });
    await act(async () => undefined);

    expect(result.current.active).toBe(true);
    expect(result.current.model).not.toBeNull();
    expect(result.current.model!.points[0]).toEqual(userCoords);
    expect(result.current.model!.points[result.current.model!.points.length - 1]).toEqual(place);
  });

  it('stop() clears the model without discarding the mode selection', async () => {
    const { result } = await renderHook(() => useDirections(place, 'en', t));
    await act(async () => {
      result.current.start();
      result.current.setMode('car');
    });
    await act(async () => undefined);
    expect(result.current.model).not.toBeNull();

    await act(async () => {
      result.current.stop();
    });
    expect(result.current.active).toBe(false);
    expect(result.current.model).toBeNull();
    expect(result.current.mode).toBe('car');
  });

  it('has no model when there is no place', async () => {
    const { result } = await renderHook(() => useDirections(null, 'en', t));
    await act(async () => {
      result.current.start();
    });
    await act(async () => undefined);
    expect(result.current.model).toBeNull();
  });
});
