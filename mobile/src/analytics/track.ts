/**
 * Event tracking shim. The real client (sessions, batching, `POST
 * /analytics/events`) is M4.2; until it plugs itself in via `setTracker`,
 * `track` is a no-op so call sites (push opens, screen views) can ship now.
 */
export type Tracker = (eventName: string, properties?: Record<string, unknown>) => void;

let tracker: Tracker | null = null;

export function setTracker(fn: Tracker | null): void {
  tracker = fn;
}

export function track(eventName: string, properties?: Record<string, unknown>): void {
  try {
    tracker?.(eventName, properties);
  } catch {
    // analytics must never break the caller
  }
}
