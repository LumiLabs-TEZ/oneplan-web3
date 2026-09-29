/**
 * Pure selection/camera/sheet-row logic for the full-screen day map.
 * Port of `ios/OnePlan/OnePlan/View/Plan/PlanDayMapView.swift:160-240`
 * (`highlightedLegIndexes`, `selectPin`, the `onChange(of: selectedPinIndex)`
 * camera block, and `onMapCameraChange`'s mini-bar collapse) plus the
 * interleaved stop/leg rows built by `PlanDayStopListSheet.expandedContent`
 * (:337-357).
 */
import type { TFunction } from 'i18next';

import type { AppLanguage } from '@/stores/settingsStore';

import { formatDistanceKm, type LatLng } from './geo';
import type { DayPin } from './planDays';
import { legInfoLabel, type DayRouteLeg, type LegMode } from '../hooks/useDayRoute';

export interface DayMapState {
  selectedPinId: number | null;
  sheet: 'mini' | 'expanded';
}

export type DayMapSheetRow =
  { kind: 'stop'; pin: DayPin } | { kind: 'leg'; index: number; label: string; mode: LegMode };

/**
 * 0-based index into `legs` for the selected pin's outgoing leg (leg `p - 1`
 * for 1-based pin index `p`), falling back to the incoming leg (`p - 2`) for
 * the last stop. `null` when nothing is selected, the pin can't be found, or
 * neither leg exists (single-pin days).
 */
export function highlightedLegIndex(
  pins: readonly DayPin[],
  selectedPinId: number | null,
): number | null {
  if (selectedPinId == null) return null;
  const pin = pins.find((p) => p.id === selectedPinId);
  if (!pin) return null;

  const legCount = Math.max(pins.length - 1, 0);
  const outgoing = pin.index - 1;
  if (outgoing >= 0 && outgoing < legCount) return outgoing;
  const incoming = pin.index - 2;
  if (incoming >= 0 && incoming < legCount) return incoming;
  return null;
}

/**
 * Camera targets: with a selection, the selected pin + its "partner" (the
 * next pin, or the previous one for the last stop) plus the highlighted leg's
 * route line; with no selection, every pin plus every leg's route line
 * (overview fit). Route points are included because a driving route can bend
 * well outside the box around its stops.
 */
export function cameraTargets(
  pins: readonly DayPin[],
  selectedPinId: number | null,
  legs: readonly DayRouteLeg[] = [],
): LatLng[] {
  const toLatLng = (p: DayPin): LatLng => ({ latitude: p.latitude, longitude: p.longitude });
  const pin = selectedPinId == null ? undefined : pins.find((p) => p.id === selectedPinId);
  if (!pin) {
    return [...pins.map(toLatLng), ...legs.flatMap((leg) => leg.points)];
  }
  const partnerIndex = pin.index < pins.length ? pin.index + 1 : pin.index - 1;
  const partner = pins.find((p) => p.index === partnerIndex);
  const legIndex = highlightedLegIndex(pins, selectedPinId);
  const legPoints = legIndex != null ? (legs[legIndex]?.points ?? []) : [];
  return [...[pin, partner].filter((p): p is DayPin => p != null).map(toLatLng), ...legPoints];
}

/**
 * Tapping the same pin/row deselects; tapping a different one selects it.
 * Either way the sheet snaps to `'expanded'` (`PlanDayMapView.selectPin`).
 */
export function togglePin(state: DayMapState, pinId: number): DayMapState {
  return {
    selectedPinId: state.selectedPinId === pinId ? null : pinId,
    sheet: 'expanded',
  };
}

/** A user-driven map pan/zoom collapses the sheet to the mini bar, leaving selection untouched. */
export function onUserPan(state: DayMapState): DayMapState {
  return { ...state, sheet: 'mini' };
}

/**
 * Interleaved stop + leg rows for the expanded sheet list: each stop is
 * followed by its outgoing leg's info row when that leg has a duration/distance
 * label (server-backed legs only — straight-line fallbacks render no row).
 */
export function sheetRows(
  pins: readonly DayPin[],
  legs: readonly DayRouteLeg[],
  locale: AppLanguage,
  t: TFunction,
): DayMapSheetRow[] {
  const rows: DayMapSheetRow[] = [];
  pins.forEach((pin, i) => {
    rows.push({ kind: 'stop', pin });
    const leg = legs[i];
    if (leg) {
      const label = legInfoLabel(leg, locale, t);
      if (label) rows.push({ kind: 'leg', index: i, label, mode: leg.mode });
    }
  });
  return rows;
}

export interface FocusedLeg {
  from: DayPin;
  to: DayPin;
  /** e.g. `"5 min"`; `null` for straight-line fallback legs. */
  duration: string | null;
  /** e.g. `"1.5 km"`; `null` for straight-line fallback legs. */
  distance: string | null;
  mode: LegMode;
}

/**
 * The leg the collapsed mini bar shows for the selected pin — the same leg the map
 * highlights (`highlightedLegIndex`): the selected stop → the next one, or the previous
 * stop → the selected one for the last stop. `null` with no selection or on a
 * single-stop day (the bar then shows the lone stop / the day overview).
 */
export function focusedLeg(
  pins: readonly DayPin[],
  legs: readonly DayRouteLeg[],
  selectedPinId: number | null,
  locale: AppLanguage,
  t: TFunction,
): FocusedLeg | null {
  const legIndex = highlightedLegIndex(pins, selectedPinId);
  if (legIndex == null) return null;
  const from = pins.find((p) => p.index === legIndex + 1);
  const to = pins.find((p) => p.index === legIndex + 2);
  if (!from || !to) return null;
  const leg = legs[legIndex];
  const hasInfo = leg?.durationSec != null && leg.distanceM != null;
  return {
    from,
    to,
    duration: hasInfo ? t('%lld min', { 0: Math.max(1, Math.round(leg.durationSec! / 60)) }) : null,
    distance: hasInfo ? formatDistanceKm(leg.distanceM!, locale) : null,
    mode: leg?.mode ?? 'drive',
  };
}

/**
 * The path the animated car drives on the day map: the highlighted leg's route
 * (`highlightedLegIndex`) while a stop is selected, otherwise nothing — the car
 * only plays for a selection, never in the overview.
 */
export function travelerPath(
  pins: readonly DayPin[],
  legs: readonly DayRouteLeg[],
  selectedPinId: number | null,
): LatLng[] {
  const legIndex = highlightedLegIndex(pins, selectedPinId);
  return legIndex != null ? [...(legs[legIndex]?.points ?? [])] : [];
}
