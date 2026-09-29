export const NOTE_ACTION_WIDTH = 84;

export function noteSwipeDestination(
  translation: number,
  width: number,
  velocity: number,
): 'delete' | 'reveal' | 'close' {
  'worklet';
  // Only distance on release commits a full swipe. A short, fast flick reveals
  // the action; scrolling/cancelled gestures never commit destructive work.
  if (width > 0 && -translation >= Math.max(NOTE_ACTION_WIDTH * 1.5, width * 0.65)) return 'delete';
  return translation + velocity * 0.08 < -NOTE_ACTION_WIDTH / 2 ? 'reveal' : 'close';
}
