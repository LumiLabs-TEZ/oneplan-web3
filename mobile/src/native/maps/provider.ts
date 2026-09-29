/**
 * Map provider + shared camera constants for every RN map. Google Maps on both
 * platforms (GCP `lumilabs-oneplandev` keys) so iOS and Android look and
 * behave the same — including the zoom-driven 3D camera and native POI taps.
 */
import { Platform } from 'react-native';
import { PROVIDER_GOOGLE } from 'react-native-maps';

import { env } from '@/lib/env';

/** `MapView`'s `provider` prop: Google Maps on both platforms. */
export function mapProvider(): 'google' {
  return PROVIDER_GOOGLE;
}

/**
 * Whether a `MapView` can be mounted. Without a Google Maps key for the platform
 * (`GOOGLE_MAPS_IOS_API_KEY` / `GOOGLE_MAPS_ANDROID_API_KEY` at build time) the SDK either
 * crashes on attach (Android: `API key not found`) or isn't linked at all (iOS: the plugin only
 * adds the GoogleMaps pod when a key is set). Render `<MapUnavailable />` instead when `false`.
 */
export function isMapAvailable(): boolean {
  return Platform.OS === 'ios' ? env.googleMapsIosConfigured : env.googleMapsAndroidConfigured;
}

/** Shared 3D/2D camera tuning for Plan-day map cards/screens. */
export const MAP_DEFAULTS = {
  pitch3D: 58,
  orbitStepDeg: 1,
  orbitIntervalMs: 120,
  /** Google's camera is zoom-driven (it ignores `altitude`): street level for the 3D orbit… */
  zoom3D: 17,
  /** …and one step out for the flat 2D view. */
  zoom2D: 16,
} as const;
