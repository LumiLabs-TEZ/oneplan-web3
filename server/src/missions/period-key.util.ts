// Calendar period keys for mission and shop caps, computed in the
// app's home timezone (Asia/Ho_Chi_Minh, fixed UTC+7 — Vietnam has no DST, so
// a constant offset is exact and avoids Intl per-call cost).

const HCM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// The given instant expressed as a Date whose UTC fields equal the HCM
// wall-clock fields.
function hcmWallClock(d: Date): Date {
  return new Date(d.getTime() + HCM_OFFSET_MS);
}

/** ISO-8601 week key, e.g. "2026-W33" (week starts Monday, HCM time). */
export function isoWeekKey(d: Date = new Date()): string {
  const t = hcmWallClock(d);
  // Shift to the Thursday of this ISO week; its year is the ISO year.
  const target = new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()),
  );
  const dayNum = (target.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const isoYear = target.getUTCFullYear();
  // Week 1 contains Jan 4th; count weeks from its Thursday.
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Month key, e.g. "2026-08" (HCM time). */
export function monthKey(d: Date = new Date()): string {
  const t = hcmWallClock(d);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Quarter key, e.g. "2026-Q3" (HCM time). */
export function quarterKey(d: Date = new Date()): string {
  const t = hcmWallClock(d);
  return `${t.getUTCFullYear()}-Q${Math.floor(t.getUTCMonth() / 3) + 1}`;
}
