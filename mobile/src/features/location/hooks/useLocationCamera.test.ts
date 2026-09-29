import { act, renderHook } from '@testing-library/react-native';
import type { RefObject } from 'react';
import type MapView from 'react-native-maps';

import type { LatLng } from '@/features/plan/helpers/geo';

import { useLocationCamera } from './useLocationCamera';

function makeMapRef() {
  const camera = {
    animateCamera: jest.fn(),
    setCamera: jest.fn(),
    getCamera: jest.fn(async () => ({ heading: 0, pitch: 0 })),
  };
  return { current: camera } as unknown as RefObject<MapView | null>;
}

const place: LatLng = { latitude: 10.77, longitude: 106.7 };

describe('useLocationCamera', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts in 3d mode', async () => {
    const mapRef = makeMapRef();
    const { result } = await renderHook(() => useLocationCamera(mapRef, place));
    expect(result.current.mode).toBe('3d');
  });

  it('animates a flat 2D camera when switching to 2d mode', async () => {
    const mapRef = makeMapRef();
    const { result, rerender } = await renderHook(() => useLocationCamera(mapRef, place));

    await act(async () => {
      result.current.setMode('2d');
    });
    await rerender({});

    expect(mapRef.current!.animateCamera).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 0, zoom: 16 }),
      expect.objectContaining({ duration: 600 }),
    );
  });

  it('flyTo animates the camera by default and resumes the orbit after 950ms', async () => {
    const mapRef = makeMapRef();
    const { result } = await renderHook(() => useLocationCamera(mapRef, place));

    await act(async () => {
      result.current.flyTo(place);
    });

    expect(mapRef.current!.animateCamera).toHaveBeenCalledWith(
      expect.objectContaining({ center: place, pitch: 58, zoom: 17 }),
      expect.objectContaining({ duration: 600 }),
    );
    expect(mapRef.current!.setCamera).not.toHaveBeenCalled();

    // Orbit is paused during the fly: no further animateCamera calls from the
    // orbit interval tick until the resume timer fires.
    const callsDuringFly = (mapRef.current!.animateCamera as jest.Mock).mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(120);
    });
    expect((mapRef.current!.animateCamera as jest.Mock).mock.calls.length).toBe(callsDuringFly);

    await act(async () => {
      jest.advanceTimersByTime(600 + 350);
    });
    // Orbit resumed: the interval tick fires again.
    await act(async () => {
      jest.advanceTimersByTime(120);
    });
    expect((mapRef.current!.animateCamera as jest.Mock).mock.calls.length).toBeGreaterThan(
      callsDuringFly,
    );
  });

  it('flyTo snaps via setCamera instead of animating when opts.snap is set', async () => {
    const mapRef = makeMapRef();
    const { result } = await renderHook(() => useLocationCamera(mapRef, place));

    const callsBefore = (mapRef.current!.animateCamera as jest.Mock).mock.calls.length;
    await act(async () => {
      result.current.flyTo(place, { snap: true });
    });

    expect(mapRef.current!.setCamera).toHaveBeenCalledWith(
      expect.objectContaining({ center: place, pitch: 58, zoom: 17 }),
    );
    expect((mapRef.current!.animateCamera as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  it('pause/resume delegate to the underlying orbit', async () => {
    const mapRef = makeMapRef();
    const { result } = await renderHook(() => useLocationCamera(mapRef, place));

    await act(async () => {
      result.current.pause();
      jest.advanceTimersByTime(500);
    });
    const callsWhilePaused = (mapRef.current!.animateCamera as jest.Mock).mock.calls.length;

    await act(async () => {
      result.current.resume();
      jest.advanceTimersByTime(120);
    });
    expect((mapRef.current!.animateCamera as jest.Mock).mock.calls.length).toBeGreaterThan(
      callsWhilePaused,
    );
  });

  it('clears the pending resume timer on unmount', async () => {
    const mapRef = makeMapRef();
    const { result, unmount } = await renderHook(() => useLocationCamera(mapRef, place));

    await act(async () => {
      result.current.flyTo(place);
    });
    let callsAfterUnmount = 0;
    await act(async () => {
      unmount();
      callsAfterUnmount = (mapRef.current!.animateCamera as jest.Mock).mock.calls.length;
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect((mapRef.current!.animateCamera as jest.Mock).mock.calls.length).toBe(callsAfterUnmount);
  });
});
