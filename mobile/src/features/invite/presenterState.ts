/**
 * Which invite code the invite presenter has already pushed a screen for.
 * Module state (not a React ref) because the join screen itself can become the
 * presented screen — a deep link mounts `/join/[code]` directly and marks the
 * code as presented, so `useRootModalPresenter` does not push a duplicate.
 */
let lastPushed: string | null = null;

/** Push only when `activeCode` transitions to a code we have not pushed yet. */
export function shouldPushInvite(prevPushed: string | null, activeCode: string | null): boolean {
  return activeCode !== null && activeCode !== prevPushed;
}

export function lastPushedInvite(): string | null {
  return lastPushed;
}

/** Records the presented code (`null` clears it so it can be presented again). */
export function markInvitePresented(code: string | null): void {
  lastPushed = code;
}
