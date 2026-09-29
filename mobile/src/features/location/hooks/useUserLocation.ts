/**
 * The device's current coordinate, resolved once on mount: request
 * foreground permission, then a single balanced-accuracy fix. `denied` covers
 * both a declined permission prompt and a fix that failed after permission
 * was granted (e.g. location services disabled).
 */
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { LatLng } from '@/features/plan/helpers/geo';

export interface UseUserLocationResult {
  coords: LatLng | null;
  denied: boolean;
  loading: boolean;
}

export function useUserLocation(): UseUserLocationResult {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          if (!cancelled) setDenied(true);
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        }
      } catch {
        if (!cancelled) setDenied(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { coords, denied, loading };
}
