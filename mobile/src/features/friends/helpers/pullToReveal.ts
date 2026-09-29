/**
 * Pull-to-reveal threshold maths for the invite QR scanner panel — port of
 * `InviteView.pullToRevealGesture` (InviteView.swift:315-344). Kept pure and unit-tested; the
 * gesture wiring in `profile/invite.tsx` stays untested glue, same split as
 * `features/invite/helpers/dragToJoin.ts` / `InvitationDragPreview.tsx`. RNGH's `PanGestureEvent`
 * has no `predictedEndTranslation` (SwiftUI-only), so `velocityY` stands in for the "about to
 * cross the threshold" signal iOS gets from the predicted translation.
 */
export const REVEAL_THRESHOLD = 90;
export const REVEAL_VELOCITY_THRESHOLD = 800;

/**
 * Whether the panel should end up revealed after a pull gesture ends. `isRevealed` is the state
 * *before* this gesture; `translationY`/`velocityY` come from the gesture's `onEnd` event. Called
 * from the Pan's `onEnd` worklet in `profile/invite.tsx` — marked `'worklet'` so Reanimated's
 * Babel plugin compiles it for the UI thread (it's imported from another file, so it isn't
 * auto-workletized the way an inline closure would be; same reasoning as
 * `features/invite/helpers/dragToJoin.ts`).
 */
export function nextRevealState(
  isRevealed: boolean,
  translationY: number,
  velocityY: number,
  threshold?: number,
  velocityThreshold?: number,
): boolean {
  'worklet';
  // Defaults resolved in the body, not as `= REVEAL_THRESHOLD` parameter defaults: Reanimated's
  // Babel plugin only captures module constants referenced in the worklet body, so a default
  // parameter expression throws "Property 'REVEAL_THRESHOLD' doesn't exist" on the UI thread.
  const distance = threshold ?? REVEAL_THRESHOLD;
  const velocity = velocityThreshold ?? REVEAL_VELOCITY_THRESHOLD;
  if (isRevealed) {
    const shouldClose = translationY < -distance || velocityY < -velocity;
    return !shouldClose;
  }
  const shouldOpen = translationY > distance || velocityY > velocity;
  return shouldOpen;
}

/**
 * `onEnd` decision, gated by whether the gesture ever passed `canPanBegin` at least once
 * (`everPassed`). A gesture that never legitimately claimed the drag (e.g. it started as a list
 * scroll, or the very last sampled frame flips `canPanBegin` false right at lift-off even though
 * earlier frames were valid) must not toggle reveal state — only `dragY`'s spring-back runs
 * unconditionally at the call site, the toggle itself stays gated here.
 */
export function resolveGestureEnd(
  everPassed: boolean,
  isRevealed: boolean,
  translationY: number,
  velocityY: number,
  threshold?: number,
  velocityThreshold?: number,
): boolean {
  'worklet';
  if (!everPassed) return isRevealed;
  return nextRevealState(isRevealed, translationY, velocityY, threshold, velocityThreshold);
}

/** Toolbar copy key toggled by reveal state — `t()` at the call site. */
export function revealLabelKey(isRevealed: boolean): string {
  return isRevealed ? 'Swipe up to close' : 'Swipe down to scan';
}

/**
 * Whether the pull-to-reveal pan should claim `translationY` this frame, vs. leaving it to the
 * friends list `ScrollView` underneath. The pan and the list's native scroll gesture run
 * simultaneously (`Gesture.Pan().simultaneousWithExternalGesture(nativeScrollGesture)` in
 * `profile/invite.tsx`), so this is the tie-break: only claim the drag when it's actually meant
 * for the reveal panel, not for scrolling the list.
 *
 * - Not revealed: only claim a *downward* drag, and only when the list is already at its top
 *   (`scrollOffset <= 0`) — otherwise a pull-down should scroll the list up as usual.
 * - Revealed: only claim an *upward* drag (closing). Scroll offset doesn't gate closing — the
 *   panel sits above the list, so an upward swipe closing it doesn't fight the list's own
 *   upward-scroll gesture the way an opening pull-down does.
 */
export function canPanBegin(
  isRevealed: boolean,
  scrollOffset: number,
  translationY: number,
): boolean {
  'worklet';
  if (isRevealed) return translationY < 0;
  return scrollOffset <= 0 && translationY > 0;
}
