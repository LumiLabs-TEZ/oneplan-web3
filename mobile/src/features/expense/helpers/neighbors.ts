/** Prev/next ids for the expense detail pager (`ExpenseDetailView.swift` `allExpenseIds`). */
export function neighborIds(
  ids: readonly number[],
  current: number,
): { prev: number | null; next: number | null } {
  const i = ids.indexOf(current);
  if (i < 0) return { prev: null, next: null };
  return { prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null };
}
