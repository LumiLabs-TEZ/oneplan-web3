import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { relativeNeedle, useDeviceHeading } from './useDeviceHeading';

describe('relativeNeedle', () => {
  it('is zero when the bearing matches the device heading', () => {
    expect(relativeNeedle(90, 90)).toBe(0);
  });

  it('wraps a negative difference into [0, 360)', () => {
    expect(relativeNeedle(10, 350)).toBe(20);
  });

  it('wraps a positive difference past 360 back down', () => {
    expect(relativeNeedle(350, 10)).toBe(340);
  });

  it('handles a full reverse (180 degrees)', () => {
    expect(relativeNeedle(0, 180)).toBe(180);
  });
});

describe('useDeviceHeading', () => {
  it('prefers trueHeading, updates from watchHeadingAsync callback', async () => {
    let deliver: ((event: { trueHeading: number; magHeading: number }) => void) | undefined;
    jest.spyOn(Location, 'watchHeadingAsync').mockImplementation(async (cb) => {
      deliver = cb as never;
      return { remove: jest.fn() };
    });

    const { result } = await renderHook(() => useDeviceHeading());
    expect(result.current).toBeNull();

    await act(async () => {
      deliver?.({ trueHeading: 42, magHeading: 10 });
    });
    expect(result.current).toBe(42);
  });

  it('falls back to magHeading when trueHeading is unavailable', async () => {
    let deliver: ((event: { trueHeading: number; magHeading: number }) => void) | undefined;
    jest.spyOn(Location, 'watchHeadingAsync').mockImplementation(async (cb) => {
      deliver = cb as never;
      return { remove: jest.fn() };
    });

    const { result } = await renderHook(() => useDeviceHeading());
    await act(async () => {
      deliver?.({ trueHeading: -1, magHeading: 77 });
    });
    expect(result.current).toBe(77);
  });

  it('stays null with no unhandled rejection when watchHeadingAsync rejects', async () => {
    jest.spyOn(Location, 'watchHeadingAsync').mockImplementation(async () => {
      throw new Error('heading unavailable');
    });

    const { result } = await renderHook(() => useDeviceHeading());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBeNull();
  });

  it('removes the subscription on unmount', async () => {
    const remove = jest.fn();
    jest.spyOn(Location, 'watchHeadingAsync').mockImplementation(async () => ({ remove }));

    const { unmount } = await renderHook(() => useDeviceHeading());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      unmount();
      await Promise.resolve();
    });
    expect(remove).toHaveBeenCalled();
  });
});
