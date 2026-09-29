/**
 * Drag-to-join maths for the trip invitation screen
 * (`View/Trip/TripInvitationView.swift:260-406`). Kept pure so the gesture
 * screen itself stays untested glue: every threshold, milestone and pill
 * dimension is decided here.
 */
import type { TripStatus } from '@/features/trip/types';

/** Track length the avatar travels before the join fires (`maxDragDistance`). */
export const MAX_DRAG = 303.5;
/** Fraction of the track that counts as "dropped in" (`dragProgress >= 0.95`). */
export const JOIN_THRESHOLD = 0.95;
/** Haptic milestones; crossing each one fires one light impact. */
export const MILESTONES = [0.33, 0.66, 0.95] as const;
/** `basePillHeight` / `minPillHeight` of the gradient pill behind the avatar. */
export const BASE_PILL_HEIGHT = 310;
export const MIN_PILL_HEIGHT = 60;
/** Degrees the avatar rotates across the full track (`maxAvatarRotation`). */
export const MAX_AVATAR_ROTATION = 90;

/**
 * Drag offset → 0…1 progress along the track. Marked `'worklet'` (like the three
 * helpers below) so the Pan gesture on the UI thread calls exactly the functions
 * these unit tests cover, instead of re-implementing the maths inline.
 */
export function dragProgress(offsetY: number): number {
  'worklet';
  if (MAX_DRAG <= 0) return 0;
  return Math.min(1, Math.max(0, offsetY / MAX_DRAG));
}

/** 0…3 — how many haptic milestones `progress` has reached. */
export function milestoneIndex(progress: number): number {
  'worklet';
  let index = 0;
  for (const milestone of MILESTONES) {
    if (progress >= milestone) index += 1;
  }
  return index;
}

/** Impacts to play when the milestone moves `prevIndex` → `nextIndex` (monotonic). */
export function hapticsToFire(prevIndex: number, nextIndex: number): number {
  return Math.max(nextIndex - prevIndex, 0);
}

/** Height of the gradient pill, which shrinks as the avatar is dragged down. */
export function topPillHeight(offsetY: number): number {
  'worklet';
  return Math.max(MIN_PILL_HEIGHT, BASE_PILL_HEIGHT - offsetY);
}

export function shouldJoin(progress: number): boolean {
  'worklet';
  return progress >= JOIN_THRESHOLD;
}

/**
 * iOS `hasOngoingTripConflict`: joining an ONGOING trip is blocked while the
 * user is already on one. A PLANNING invite is always joinable.
 */
export function hasOngoingConflict(
  previewStatus: TripStatus | undefined,
  myOngoingCount: number,
): boolean {
  return previewStatus === 'ONGOING' && myOngoingCount >= 1;
}
