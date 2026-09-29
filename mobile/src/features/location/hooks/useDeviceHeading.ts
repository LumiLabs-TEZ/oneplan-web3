/**
 * Device compass heading. Ports `DeviceHeadingService`
 * (`ios/OnePlan/OnePlan/Services/DeviceHeadingService.swift`): true heading
 * with a magnetic-heading fallback, subscribed on mount and removed on
 * unmount.
 */
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/** Rotation (degrees `[0, 360)`) to point a compass needle from the device's
 * current heading toward `bearing`. */
export function relativeNeedle(bearing: number, deviceHeading: number): number {
  return (((bearing - deviceHeading) % 360) + 360) % 360;
}

/** Live device heading in degrees `[0, 360)`, `null` until the first reading
 * arrives. Prefers `trueHeading`; falls back to `magHeading` when the device
 * has no true-heading fix. */
export function useDeviceHeading(): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    void Location.watchHeadingAsync((event) => {
      const value = event.trueHeading >= 0 ? event.trueHeading : event.magHeading;
      setHeading(value);
    })
      .then((sub) => {
        if (cancelled) {
          sub.remove();
          return;
        }
        subscription = sub;
      })
      .catch(() => {
        // Heading unavailable (no compass, permission denied, simulator without a sensor, …) —
        // stays `null` rather than throwing an unhandled rejection.
      });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return heading;
}
