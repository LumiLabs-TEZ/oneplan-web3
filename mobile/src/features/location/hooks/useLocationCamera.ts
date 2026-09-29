/**
 * Location-detail map camera modes. Ports `LocationDetailView`'s
 * `cameraPosition`/`transitionTo`/`flyToDisplayedPlaceThenOrbit`
 * (`ios/OnePlan/OnePlan/View/LocationDetailView.swift:128-132, 615-703,
 * 1147-1159`): `'3d'` orbits at zoom 17 / pitch 58 via `useOrbitCamera`, `'2d'` is a
 * flat zoom 16 view, `'directions'` hands framing to the caller (midpoint fit).
 * `flyTo` pauses the orbit, animates (or snaps) the camera, then resumes the
 * orbit 350 ms after the 600 ms fly settles — matching the iOS
 * `flyDuration + 0.35` delay so the orbit never re-targets mid-fly.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type MapView from 'react-native-maps';

import type { LatLng } from '@/features/plan/helpers/geo';
import { MAP_DEFAULTS } from '@/native/maps/provider';
import { useOrbitCamera } from '@/native/maps/useOrbitCamera';

export type LocationCameraMode = '3d' | '2d' | 'directions';

export interface UseLocationCameraResult {
  mode: LocationCameraMode;
  setMode: (mode: LocationCameraMode) => void;
  flyTo: (center: LatLng, opts?: { snap?: boolean }) => void;
  /** Locate button: centre on `center`. Flattens a 3D orbit to 2D; directions keep their framing. */
  centerOn: (center: LatLng) => void;
  /** Compass button: rotate back to north-up and flatten (stops a 3D orbit). */
  resetNorth: () => void;
  pause: () => void;
  resume: () => void;
}

const FLY_DURATION_MS = 600;
const ORBIT_RESUME_DELAY_MS = 350;

export function useLocationCamera(
  mapRef: React.RefObject<MapView | null>,
  place: LatLng | null,
): UseLocationCameraResult {
  const [mode, setMode] = useState<LocationCameraMode>('3d');
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** `centerOn` already animates to a 2D camera — the mode effect must not re-flatten over it. */
  const skipFlattenRef = useRef(false);

  const orbit = useOrbitCamera(mapRef, {
    center: place,
    enabled: mode === '3d',
    pitch: MAP_DEFAULTS.pitch3D,
    stepDeg: MAP_DEFAULTS.orbitStepDeg,
    intervalMs: MAP_DEFAULTS.orbitIntervalMs,
  });

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearResumeTimer, [clearResumeTimer]);

  // iOS resumes the orbit from `currentMapHeading`. The fly/mode switch keeps the map's current
  // heading (e.g. north-up after directions), so read it back before the orbit's next tick —
  // otherwise it continues from its own stale heading and the camera snaps around.
  const { setHeading } = orbit;
  const syncHeading = useCallback(() => {
    void mapRef.current
      ?.getCamera()
      .then((current) => setHeading(current.heading))
      .catch(() => undefined);
  }, [mapRef, setHeading]);

  const flyTo = useCallback(
    (center: LatLng, opts?: { snap?: boolean }) => {
      orbit.pause();
      clearResumeTimer();
      syncHeading();
      const camera = {
        center,
        pitch: MAP_DEFAULTS.pitch3D,
        zoom: MAP_DEFAULTS.zoom3D,
      };
      if (opts?.snap) {
        mapRef.current?.setCamera(camera);
      } else {
        mapRef.current?.animateCamera(camera, { duration: FLY_DURATION_MS });
      }
      resumeTimerRef.current = setTimeout(() => {
        resumeTimerRef.current = null;
        orbit.resume();
      }, FLY_DURATION_MS + ORBIT_RESUME_DELAY_MS);
    },
    [clearResumeTimer, mapRef, orbit, syncHeading],
  );

  useEffect(() => {
    if (mode === '3d') syncHeading();
  }, [mode, syncHeading]);

  const centerOn = useCallback(
    (center: LatLng) => {
      clearResumeTimer();
      if (mode === 'directions') {
        mapRef.current?.animateCamera({ center }, { duration: FLY_DURATION_MS });
        return;
      }
      if (mode === '3d') {
        skipFlattenRef.current = true;
        setMode('2d');
      }
      mapRef.current?.animateCamera(
        { center, pitch: 0, zoom: MAP_DEFAULTS.zoom2D },
        { duration: FLY_DURATION_MS },
      );
    },
    [clearResumeTimer, mapRef, mode],
  );

  const resetNorth = useCallback(() => {
    clearResumeTimer();
    if (mode === '3d') {
      skipFlattenRef.current = true;
      setMode('2d');
    }
    mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: FLY_DURATION_MS });
  }, [clearResumeTimer, mapRef, mode]);

  useEffect(() => {
    if (mode !== '2d') return;
    if (skipFlattenRef.current) {
      skipFlattenRef.current = false;
      return;
    }
    mapRef.current?.animateCamera(
      { pitch: 0, zoom: MAP_DEFAULTS.zoom2D },
      { duration: FLY_DURATION_MS },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mode switch, not per mapRef identity
  }, [mode]);

  return { mode, setMode, flyTo, centerOn, resetNorth, pause: orbit.pause, resume: orbit.resume };
}
