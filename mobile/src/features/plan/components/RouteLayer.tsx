/**
 * `MapView` children for a day's route: numbered pins + driving-leg
 * polylines. Meant to be rendered inside a `react-native-maps` `MapView`
 * (`PlanRouteMapCard`, and the full-screen Plan-day map in a later task).
 */
import { Polyline } from 'react-native-maps';

import { NumberedMarker } from '@/native/maps/NumberedMarker';
import { colors } from '@/ui/theme';

import type { DayRouteLeg } from '../hooks/useDayRoute';
import type { DayPin } from '../helpers/planDays';

export interface RouteLayerProps {
  pins: readonly DayPin[];
  legs: readonly DayRouteLeg[];
  /** Index into `legs` to isolate — driven by "focus this leg" interactions. */
  highlightedLeg?: number;
  /** When `true`, only `highlightedLeg`'s polyline renders (all pins still show). */
  focusMode?: boolean;
  onPinPress?: (pin: DayPin) => void;
  selectedPinId?: number;
  /** Dash pattern for walked legs (`walkDashPattern`); without it walked legs draw solid. */
  walkDashPattern?: readonly number[];
}

export function RouteLayer({
  pins,
  legs,
  highlightedLeg,
  focusMode,
  onPinPress,
  selectedPinId,
  walkDashPattern,
}: RouteLayerProps) {
  // Keep each leg's original index: keys must follow the leg, not its position in the
  // filtered list, or focus mode reuses another leg's native polyline.
  const visibleLegs = legs
    .map((leg, index) => ({ leg, index }))
    .filter(({ index }) => !(focusMode && highlightedLeg != null) || index === highlightedLeg);

  return (
    <>
      {visibleLegs.map(({ leg, index }) => {
        const dashed = leg.mode === 'walk' && walkDashPattern != null;
        return (
          <Polyline
            // Mode in the key: iOS Google Maps keeps a polyline's dash spans after the pattern
            // is cleared, so switching dashed ↔ solid needs a fresh native polyline.
            key={`route-leg-${index}-${leg.points.length}-${dashed ? 'dash' : 'solid'}`}
            coordinates={leg.points}
            strokeColor={colors.blueBase}
            strokeWidth={3}
            lineDashPattern={dashed ? [...walkDashPattern] : undefined}
            // Android turns dashes into dots with a round cap.
            lineCap={dashed ? 'butt' : 'round'}
          />
        );
      })}
      {pins.map((pin) => (
        <NumberedMarker
          key={pin.id}
          coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
          index={pin.index}
          onPress={() => onPinPress?.(pin)}
          selected={selectedPinId === pin.id}
          testID={`route-marker-${pin.id}`}
        />
      ))}
    </>
  );
}
