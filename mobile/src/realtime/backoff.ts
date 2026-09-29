/**
 * Reconnect backoff policy. `attempt` is 1-based. Returns `null` once the
 * attempt budget (10) is exhausted so callers know to stop retrying.
 */
export function nextDelayMs(attempt: number, random: () => number = Math.random): number | null {
  if (attempt > 10) return null;
  const base = Math.min(attempt * 2000, 30000);
  const factor = 1 + (random() * 0.6 - 0.3);
  return Math.round(base * factor);
}
