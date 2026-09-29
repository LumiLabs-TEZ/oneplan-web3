/**
 * Pure list-reorder math for `RearrangeDateSheet`'s drag gesture.
 *
 * Port of `RearrangeDateBottomSheet.move(_:toY:)`
 * (`ios/OnePlan/OnePlan/Component/BottomSheet/RearrangeDateBottomSheet.swift:213-227`): iOS tracks
 * row frames via a `PreferenceKey` and picks the target row whose frame contains the drag's
 * absolute Y. RN instead lays rows out at a fixed `rowHeight`, so the target index is a simple
 * offset-from-start calculation (`indexForOffset`) — no frame bookkeeping needed.
 */

/** Moves the item at `from` to `to`, shifting everything in between. No-op (returns the same
 * array reference) when `from`/`to` are out of bounds or equal.
 *
 * Marked `'worklet'` so `RearrangeDateSheet` can call it directly from its `Gesture.Pan()`
 * `onUpdate` (UI thread) as well as from plain JS (tests, the drag's `onEnd` commit). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  'worklet';
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) {
    return list.slice();
  }
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** Target row index for a drag that started at `startIndex` and has moved `dy` px, given a fixed
 * `rowHeight` and `count` rows total. Clamped to `[0, count - 1]`. Also `'worklet'`-marked — see
 * `moveItem`. */
export function indexForOffset(
  startIndex: number,
  dy: number,
  rowHeight: number,
  count: number,
): number {
  'worklet';
  if (count <= 0) return 0;
  if (rowHeight <= 0) return Math.max(0, Math.min(startIndex, count - 1));
  const rawIndex = startIndex + Math.round(dy / rowHeight);
  return Math.max(0, Math.min(rawIndex, count - 1));
}
