/**
 * The free-trial promo's 1-hour offer window (`OnboardingManager.swift:34-47`
 * `startTrialOfferWindowIfNeeded`, `FreeTrialView.swift:84-100, 342-351` auto-dismiss + countdown).
 * Pure helpers so the deadline math is unit-testable without a clock/timer.
 */

/** Matches `OnboardingManager.swift:34` (`60 * 60` seconds). */
export const TRIAL_WINDOW_MS = 3_600_000;

/**
 * Returns the existing deadline, or starts the window now (`now + windowMs`) when none is set yet.
 * Call only when actually about to present, so the clock starts at the first real presentation
 * (`OnboardingManager.swift:33`).
 */
export function startWindowIfNeeded(
  deadline: number | null,
  now: number,
  windowMs: number = TRIAL_WINDOW_MS,
): number {
  if (deadline !== null) return deadline;
  return now + windowMs;
}

/** Whether the offer is still live — `null` deadline (never started) is never open. */
export function isWindowOpen(deadline: number | null, now: number): boolean {
  return deadline !== null && now < deadline;
}

export interface TrialCountdownValue {
  hrs: number;
  min: number;
  sec: number;
}

/** Zero-floored remaining time to `deadline` (`FreeTrialView.swift:342-351`). */
export function countdown(deadline: number | null, now: number): TrialCountdownValue {
  const totalSeconds = deadline === null ? 0 : Math.max(0, Math.floor((deadline - now) / 1000));
  return {
    hrs: Math.floor(totalSeconds / 3_600),
    min: Math.floor((totalSeconds % 3_600) / 60),
    sec: totalSeconds % 60,
  };
}
