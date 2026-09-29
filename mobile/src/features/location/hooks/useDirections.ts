/**
 * Directions overlay state for a place: resolves the user's live coordinate
 * and derives a `DirectionsModel` while active. Ports the
 * `isShowingDirections` + `directionsTransportMode` state from
 * `LocationDetailView` (`ios/OnePlan/OnePlan/View/LocationDetailView.swift`)
 * onto the shared `directionsModel` helper.
 */
import type { TFunction } from 'i18next';
import { useCallback, useState } from 'react';

import type { LatLng, TransportMode } from '@/features/plan/helpers/geo';
import type { AppLanguage } from '@/stores/settingsStore';

import { directionsModel, type DirectionsModel } from '../helpers/directions';
import { useUserLocation } from './useUserLocation';

export interface UseDirectionsResult {
  active: boolean;
  mode: TransportMode;
  model: DirectionsModel | null;
  start: () => void;
  stop: () => void;
  setMode: (mode: TransportMode) => void;
}

export function useDirections(
  place: LatLng | null,
  locale: AppLanguage,
  t: TFunction,
): UseDirectionsResult {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<TransportMode>('walk');
  const { coords } = useUserLocation();

  const start = useCallback(() => setActive(true), []);
  const stop = useCallback(() => setActive(false), []);

  const model = active ? directionsModel(coords, place, mode, locale, t) : null;

  return { active, mode, model, start, stop, setMode };
}
