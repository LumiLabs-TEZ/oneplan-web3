/**
 * Tiny time formatters shared by plan item voice/timeline UI.
 * Port of the inline formatting in
 * `ios/OnePlan/OnePlan/Component/Trip/TripPlanSection.swift:167-169` (duration)
 * and `:218,233` (`String(format: "%02d:%02d", hour, minute)`).
 */

/** `125` seconds -> `"2:05"`. Minutes are unpadded, seconds zero-padded to 2. */
export function formatDuration(seconds: number): string {
  const total = Math.trunc(seconds);
  const minutes = Math.trunc(total / 60);
  const secs = Math.abs(total % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/** `hhmm(9, 5)` -> `"09:05"`. */
export function hhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Form time value in the device's style — `DisplayFormatters.time` on iOS (`"8:00 AM"` on a
 * 12-hour device, `"08:00"` on 24-hour). `uses24hourClock` undefined → the locale default.
 */
export function formatPlanTime(
  hour: number,
  minute: number,
  locale: string,
  uses24hourClock?: boolean,
): string {
  const date = new Date(2000, 0, 1, hour, minute);
  return new Intl.DateTimeFormat(locale, {
    hour: uses24hourClock ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: uses24hourClock === undefined ? undefined : !uses24hourClock,
  }).format(date);
}
