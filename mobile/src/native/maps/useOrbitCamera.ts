/**
 * Orbiting camera loop for mini map previews — heading advances by `stepDeg`
 * every `intervalMs` and is pushed to the map via `animateCamera`. Ports the
 * heading-increment loop from `PlanDetailView.swift:591-640`
 * (`PlanDetailMapPreview`, distance 900 → zoom 17 / pitch 58 / +1°/0.12 s) and
 * `LocationDetailView.swift:128-132,666-700` (pause/resume on interaction).
 *
 * `heading` is kept in a ref, not state — ticking 8×/s would otherwise
 * re-render the host component at the same rate for a value nothing in this
 * hook's own render output needs. Callers that do need the live value (e.g.
 * for a snapshot) call the returned `heading()` getter.
 *
 * Also pauses/resumes on `AppState` background/foreground transitions — implemented once here
 * (rather than in each consumer, `OrbitMapCard`/`useLocationCamera`) so every orbiting map stops
 * ticking `animateCamera` while the app isn't visible, and picks back up on return. This is
 * independent of a caller's own `enabled`/focus gating (e.g. `OrbitMapCard`'s `useFocusEffect`) —
 * both must hold for the timer to run.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type MapView from 'react-native-maps';

import type { LatLng } from '@/features/plan/helpers/geo';

import { MAP_DEFAULTS } from './provider';

export interface UseOrbitCameraOptions {
  center: LatLng | null;
  enabled: boolean;
  pitch?: number;
  stepDeg?: number;
  intervalMs?: number;
  zoom?: number;
}

export interface UseOrbitCameraResult {
  pause: () => void;
  resume: () => void;
  /** Getter for the current heading in degrees `[0, 360)`. Call it to read the
   * live value — it's backed by a ref, not state, so it is never itself a
   * reason for the host component to re-render. */
  heading: () => number;
  /** Continue the orbit from `deg` (e.g. the map's live heading after a fly) instead of the last
   * orbit heading — otherwise the next tick jumps the camera back to where the orbit left off. */
  setHeading: (deg: number) => void;
}

/** `(h + step) % 360`, wrapping back to `0` once it reaches `360`. */
export function nextHeading(h: number, step = 1): number {
  return (h + step) % 360;
}

export function useOrbitCamera(
  mapRef: React.RefObject<MapView | null>,
  options: UseOrbitCameraOptions,
): UseOrbitCameraResult {
  const {
    center,
    enabled,
    pitch = 58,
    stepDeg = 1,
    intervalMs = 120,
    zoom = MAP_DEFAULTS.zoom3D,
  } = options;

  // Key every effect/callback dependency array off primitive lat/lng, not the
  // `center` object's identity — callers (e.g. a screen passing an inline
  // `{ latitude, longitude }` literal) may recreate an equal-valued object on
  // every render, which would otherwise tear down and restart the interval
  // on every re-render and stall the orbit.
  const lat = center?.latitude ?? null;
  const lng = center?.longitude ?? null;
  // Rebuilt only when the coordinates actually change, so `animateCamera`
  // always receives a fresh-but-stable `LatLng` without depending on the
  // caller's object identity.
  const stableCenter = useMemo<LatLng | null>(
    () => (lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null),
    [lat, lng],
  );

  const headingRef = useRef(0);
  const pausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // `AppState.currentState` starts out `null`/stale until the native bridge reports back
  // (see `useAnalyticsLifecycle`'s identical note) — a hook mounting is itself evidence the app
  // is foregrounded, so start optimistic and let the `change` listener correct it from there.
  const [backgrounded, setBackgrounded] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      setBackgrounded(next !== 'active');
    });
    return () => subscription.remove();
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    if (!enabled || !stableCenter || pausedRef.current || backgrounded) return;
    timerRef.current = setInterval(() => {
      headingRef.current = nextHeading(headingRef.current, stepDeg);
      mapRef.current?.animateCamera(
        {
          center: stableCenter,
          pitch,
          heading: headingRef.current,
          zoom,
        },
        { duration: intervalMs },
      );
    }, intervalMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stableCenter, pitch, zoom, stepDeg, intervalMs, backgrounded, clearTimer]);

  // `resume` is typically scheduled from a timer (`useLocationCamera.flyTo` resumes ~1 s after a
  // fly) that captured the render in which the fly started — i.e. *before* the new place's center
  // reached this hook. Reading the latest state through a ref keeps a stale `resume` from
  // restarting the orbit around the previous center (the camera would snap back to the old POI).
  const latestRef = useRef({ enabled, stableCenter, backgrounded, startTimer });
  useEffect(() => {
    latestRef.current = { enabled, stableCenter, backgrounded, startTimer };
  }, [enabled, stableCenter, backgrounded, startTimer]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const resume = useCallback(() => {
    pausedRef.current = false;
    // The effect below owns starting the interval on prop changes; flipping
    // `pausedRef` isn't itself observed by React, so restart here directly —
    // continuing from the last heading held in `headingRef`. Stays off while
    // backgrounded — the `AppState` listener resumes it once foregrounded.
    const latest = latestRef.current;
    if (
      latest.enabled &&
      latest.stableCenter &&
      !latest.backgrounded &&
      timerRef.current === null
    ) {
      latest.startTimer();
    }
  }, []);

  useEffect(() => {
    if (enabled && stableCenter && !pausedRef.current && !backgrounded) {
      startTimer();
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [enabled, stableCenter, backgrounded, startTimer, clearTimer]);

  const heading = useCallback(() => headingRef.current, []);
  const setHeading = useCallback((deg: number) => {
    headingRef.current = ((deg % 360) + 360) % 360;
  }, []);

  return { pause, resume, heading, setHeading };
}
