/**
 * Year-chip range — port of `PassportView.swift:83` (`availableYears`).
 * memberSince year → current year, descending. Clamped so a future or
 * unparseable memberSince can't produce an empty/inverted range.
 */
export function availableYears(memberSince: string | null, now: Date): number[] {
  const currentYear = now.getFullYear();
  let startYear = currentYear;

  if (memberSince) {
    const date = new Date(memberSince);
    if (!Number.isNaN(date.getTime())) {
      startYear = Math.min(date.getFullYear(), currentYear);
    }
  }

  const years: number[] = [];
  for (let year = currentYear; year >= startYear; year--) {
    years.push(year);
  }
  return years;
}
