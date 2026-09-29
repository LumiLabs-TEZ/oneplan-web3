import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import type MapView from 'react-native-maps';

import { nextHeading, useOrbitCamera } from './useOrbitCamera';

type AppStateListener = (state: AppStateStatus) => void;

describe('nextHeading', () => {
  it('advances by the step', () => {
    expect(nextHeading(10, 1)).toBe(11);
  });

  it('wraps at 360 back to 0', () => {
    expect(nextHeading(359, 1)).toBe(0);
  });

  it('defaults the step to 1', () => {
    expect(nextHeading(0)).toBe(1);
  });
});

function makeMapRef() {
  const animateCamera = jest.fn();
  return { current: { animateCamera } as unknown as MapView };
}

const center = { latitude: 10.77, longitude: 106.7 };

describe('useOrbitCamera', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('calls animateCamera with an increasing heading, sending the zoom-driven Google camera', async () => {
    const mapRef = makeMapRef();
    const { unmount } = await renderHook(() => useOrbitCamera(mapRef, { center, enabled: true }));

    await act(() => {
      jest.advanceTimersByTime(120 * 3);
    });

    const animateCamera = mapRef.current.animateCamera as jest.Mock;
    expect(animateCamera).toHaveBeenCalledTimes(3);
    expect(animateCamera.mock.calls[0]![0]).toMatchObject({
      center,
      pitch: 58,
      heading: 1,
      zoom: 17,
    });
    expect(animateCamera.mock.calls[1]![0]).toMatchObject({ heading: 2 });
    expect(animateCamera.mock.calls[2]![0]).toMatchObject({ heading: 3 });

    await unmount();
  });

  it('does not tick when disabled', async () => {
    const mapRef = makeMapRef();
    const { unmount } = await renderHook(() => useOrbitCamera(mapRef, { center, enabled: false }));

    await act(() => {
      jest.advanceTimersByTime(120 * 5);
    });

    expect(mapRef.current.animateCamera).not.toHaveBeenCalled();

    await unmount();
  });

  it('does not tick when center is null', async () => {
    const mapRef = makeMapRef();
    const { unmount } = await renderHook(() =>
      useOrbitCamera(mapRef, { center: null, enabled: true }),
    );

    await act(() => {
      jest.advanceTimersByTime(120 * 5);
    });

    expect(mapRef.current.animateCamera).not.toHaveBeenCalled();

    await unmount();
  });

  it('pause stops ticking and resume continues from the last heading', async () => {
    const mapRef = makeMapRef();
    const { result, unmount } = await renderHook(() =>
      useOrbitCamera(mapRef, { center, enabled: true }),
    );

    await act(() => {
      jest.advanceTimersByTime(120 * 2);
    });
    const animateCamera = mapRef.current.animateCamera as jest.Mock;
    expect(animateCamera).toHaveBeenCalledTimes(2);
    expect(result.current.heading()).toBe(2);

    await act(() => {
      result.current.pause();
    });
    await act(() => {
      jest.advanceTimersByTime(120 * 3);
    });
    expect(animateCamera).toHaveBeenCalledTimes(2);
    expect(result.current.heading()).toBe(2);

    await act(() => {
      result.current.resume();
    });
    await act(() => {
      jest.advanceTimersByTime(120);
    });
    expect(animateCamera).toHaveBeenCalledTimes(3);
    expect(animateCamera.mock.calls[2]![0]).toMatchObject({ heading: 3 });

    await unmount();
  });

  it('clears the timer on unmount', async () => {
    const mapRef = makeMapRef();
    const { unmount } = await renderHook(() => useOrbitCamera(mapRef, { center, enabled: true }));

    await unmount();

    await act(() => {
      jest.advanceTimersByTime(120 * 5);
    });
    expect(mapRef.current.animateCamera).not.toHaveBeenCalled();
  });

  it('re-centers around a new center without resetting heading', async () => {
    const mapRef = makeMapRef();
    const { result, rerender, unmount } = await renderHook(
      ({ c }: { c: typeof center }) => useOrbitCamera(mapRef, { center: c, enabled: true }),
      { initialProps: { c: center } },
    );

    await act(() => {
      jest.advanceTimersByTime(120);
    });
    expect(result.current.heading()).toBe(1);

    const newCenter = { latitude: 11, longitude: 107 };
    await rerender({ c: newCenter });

    await act(() => {
      jest.advanceTimersByTime(120);
    });

    const animateCamera = mapRef.current.animateCamera as jest.Mock;
    expect(animateCamera).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: newCenter, heading: 2 }),
      expect.anything(),
    );

    await unmount();
  });

  describe('AppState background/foreground', () => {
    // Scoped `beforeEach`/`afterEach` (mirrors `useAnalyticsLifecycle.test.ts`) rather than a
    // per-test `jest.spyOn(...).mockRestore()` — restoring mid-test left a *later* test's
    // untouched `AppState.addEventListener` call returning `undefined` instead of the preset's
    // default `{ remove }` subscription (a `mockRestore` quirk on an already-automocked fn).
    let listener: AppStateListener | null = null;
    const remove = jest.fn();

    beforeEach(() => {
      listener = null;
      remove.mockClear();
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
        listener = fn as AppStateListener;
        return { remove } as ReturnType<typeof AppState.addEventListener>;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('pauses ticking when AppState goes to background, and resumes when it returns to active', async () => {
      const mapRef = makeMapRef();
      const { result, unmount } = await renderHook(() =>
        useOrbitCamera(mapRef, { center, enabled: true }),
      );

      await act(() => {
        jest.advanceTimersByTime(120 * 2);
      });
      const animateCamera = mapRef.current.animateCamera as jest.Mock;
      expect(animateCamera).toHaveBeenCalledTimes(2);
      expect(result.current.heading()).toBe(2);

      await act(async () => {
        listener?.('background');
      });
      await act(() => {
        jest.advanceTimersByTime(120 * 3);
      });
      expect(animateCamera).toHaveBeenCalledTimes(2);
      expect(result.current.heading()).toBe(2);

      await act(async () => {
        listener?.('active');
      });
      await act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(animateCamera).toHaveBeenCalledTimes(3);
      expect(animateCamera.mock.calls[2]![0]).toMatchObject({ heading: 3 });

      await unmount();
    });

    it('removes the AppState subscription on unmount', async () => {
      const mapRef = makeMapRef();
      const { unmount } = await renderHook(() => useOrbitCamera(mapRef, { center, enabled: true }));

      await unmount();

      expect(remove).toHaveBeenCalledTimes(1);
    });
  });

  it('does not reset the timer when re-rendered with a new object of the same coordinates', async () => {
    const mapRef = makeMapRef();
    const { rerender, unmount } = await renderHook(
      ({ c }: { c: typeof center }) => useOrbitCamera(mapRef, { center: c, enabled: true }),
      { initialProps: { c: center } },
    );

    await act(() => {
      jest.advanceTimersByTime(120 * 2);
    });
    const animateCamera = mapRef.current.animateCamera as jest.Mock;
    expect(animateCamera).toHaveBeenCalledTimes(2);

    // Same lat/lng, but a brand-new object — mirrors a caller passing an
    // inline `{ latitude, longitude }` literal that's recreated every render.
    const sameCoordsNewObject = { latitude: center.latitude, longitude: center.longitude };
    await rerender({ c: sameCoordsNewObject });

    await act(() => {
      jest.advanceTimersByTime(120);
    });

    // No clearInterval/restart in between: heading keeps advancing (3, not
    // reset to 1) and the interval wasn't torn down (still exactly 1 more
    // call, not 2 from a stop-then-restart).
    expect(animateCamera).toHaveBeenCalledTimes(3);
    expect(animateCamera.mock.calls[2]![0]).toMatchObject({ heading: 3 });

    await unmount();
  });

  it('a resume captured before a center change orbits the new center, not the old one', async () => {
    const mapRef = makeMapRef();
    const next = { latitude: 10.8, longitude: 106.75 };
    const { result, rerender, unmount } = await renderHook(
      (props: { center: typeof center }) =>
        useOrbitCamera(mapRef, { center: props.center, enabled: true }),
      { initialProps: { center } },
    );

    // `useLocationCamera.flyTo`: pause, then a timer resumes with the callbacks of *this* render.
    const staleResume = result.current.resume;
    await act(() => {
      result.current.pause();
    });
    await rerender({ center: next });
    await act(() => {
      staleResume();
      jest.advanceTimersByTime(120);
    });

    const animateCamera = mapRef.current.animateCamera as jest.Mock;
    expect(animateCamera).toHaveBeenCalledTimes(1);
    expect(animateCamera.mock.calls[0]![0]).toMatchObject({ center: next });

    await unmount();
  });
});
