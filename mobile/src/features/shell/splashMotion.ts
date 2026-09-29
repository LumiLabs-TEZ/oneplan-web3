/**
 * Timing + geometry of the cold-start reveal, ported from `SplashScreenView.swift`.
 * The logo sits in a 120pt frame; the reveal scales it until a 4× screen-sized box fits inside it.
 */
export const SPLASH_LOGO_SIZE = 120;
export const SPLASH_LOGO_RADIUS = 32;

export const SPLASH_MOTION = {
  /** `initialDelay` — hold the first frame before anything moves. */
  initialDelayMs: 350,
  /** `scaleDown` — `.smooth(duration: 0.3)` to 0.8. */
  scaleDown: 0.8,
  scaleDownMs: 300,
  /** `scaleUpDelay` — the grow starts 0.1s after the shrink starts (they overlap). */
  scaleUpDelayMs: 100,
  /** `scaleUpAnimation` — `.smooth(duration: 1)` for scale, blur and fade together. */
  scaleUpMs: 1000,
  blurRadius: 15,
  /** Reduce Motion: plain `.easeOut(duration: 0.5)` fade after the initial delay. */
  reducedFadeMs: 500,
} as const;

/** Swift `.smooth` = a critically damped spring of the given duration (no overshoot). */
export const smoothSpring = (duration: number) => ({ duration, dampingRatio: 1 });

/**
 * Scale at which the 120pt logo covers the screen: `SplashScreenView` sizes a box 4× the screen
 * and scales the logo frame until it matches the larger side of that box.
 */
export function coverScale(
  screen: { width: number; height: number },
  frame: number = SPLASH_LOGO_SIZE,
): number {
  if (screen.width <= 0 || screen.height <= 0) return 1;
  return Math.max((screen.width * 4) / frame, (screen.height * 4) / frame);
}
