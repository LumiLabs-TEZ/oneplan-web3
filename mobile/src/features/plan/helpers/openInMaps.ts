/**
 * "Open in maps" chooser + deep-link launcher for the distance connector
 * between two timeline items. Port of
 * `TripPlanSection.openRouteInAppleMaps`/`.openRouteInGoogleMaps`
 * (`ios/OnePlan/OnePlan/Component/Trip/TripPlanSection.swift:288-330`), which
 * used a `.popover` with two buttons; the RN port uses a native action sheet
 * (iOS) / alert (Android) instead since there's no SwiftUI popover equivalent.
 */
import type { TFunction } from 'i18next';
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';

import { appleMapsUrl, googleMapsUrl, placeQuery, type LatLng, type TransportMode } from './geo';

export type MapChoice = 'apple' | 'google';
export type MapsPlatform = 'ios' | 'android';

/** Choices offered per platform: iOS lets the user pick, Android only has Google Maps
 * installed by default. */
export function mapsChoices(platform: MapsPlatform): MapChoice[] {
  return platform === 'ios' ? ['apple', 'google'] : ['google'];
}

/** Presents the native chooser and invokes `onChoice` with the user's pick. Cancel never
 * calls `onChoice`. */
export function presentMapsChooser(
  t: TFunction,
  onChoice: (choice: MapChoice) => void,
  platform: MapsPlatform = Platform.OS === 'ios' ? 'ios' : 'android',
): void {
  const choices = mapsChoices(platform);

  if (platform === 'ios') {
    const labels = choices.map((c) => (c === 'apple' ? t('Apple Maps') : t('Google Maps')));
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...labels, t('Cancel')], cancelButtonIndex: labels.length },
      (index) => {
        const choice = choices[index];
        if (choice) onChoice(choice);
      },
    );
    return;
  }

  Alert.alert('', undefined, [
    { text: t('Google Maps'), onPress: () => onChoice('google') },
    { text: t('Cancel'), style: 'cancel' },
  ]);
}

export interface DirectionsParams {
  origin?: LatLng;
  destination: LatLng;
  mode: TransportMode;
  name?: string;
  address?: string | null;
  originName?: string;
  originAddress?: string | null;
}

/** Opens the chosen maps app for turn-by-turn directions. Alerts on failure (app not
 * installed / the OS refuses the URL) rather than throwing into the caller's tap handler. */
export async function openDirections(
  params: DirectionsParams,
  choice: MapChoice,
  t: TFunction,
): Promise<void> {
  const url =
    choice === 'apple'
      ? appleMapsUrl(params)
      : googleMapsUrl({
          ...params,
          destinationQuery: placeQuery(params.name, params.address),
          originQuery: placeQuery(params.originName, params.originAddress),
        });
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) throw new Error(`Cannot open URL: ${url}`);
    await Linking.openURL(url);
  } catch {
    Alert.alert(t('Something went wrong'));
  }
}
