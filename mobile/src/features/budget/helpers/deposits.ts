/**
 * Per-member deposit aggregation for the budget "Who Deposit" screen — port of
 * `WhoDepositView.entries` / `paymentItems` (`WhoDepositView.swift:252-310`) and the paid-progress
 * sheet's dynamic height formula (`PaidProgressBottomSheet.swift`).
 */
import type { components } from '@/api/schema';

type BudgetDto = components['schemas']['BudgetDto'];

export interface DepositRow {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  /** One entry per budget the member has a payment row in, in budget order. */
  segments: boolean[];
  /** Sum of `isPaid` payment amounts only — unpaid pledges aren't real money yet. */
  paidAmount: number;
  /** Count of `isPaid` payment rows. */
  paidCount: number;
}

/** Per-member totals across every budget's payment rows, sorted by display name. */
export function aggregateDeposits(budgets: readonly BudgetDto[]): DepositRow[] {
  const byUser = new Map<number, DepositRow>();

  for (const budget of budgets) {
    for (const payment of budget.payments) {
      let row = byUser.get(payment.userId);
      if (!row) {
        row = {
          userId: payment.userId,
          displayName: payment.displayName,
          avatarUrl: payment.avatarUrl ?? null,
          segments: [],
          paidAmount: 0,
          paidCount: 0,
        };
        byUser.set(payment.userId, row);
      }
      row.segments.push(payment.isPaid);
      if (payment.isPaid) {
        row.paidAmount += payment.amount;
        row.paidCount += 1;
      }
    }
  }

  return [...byUser.values()].sort((a, b) =>
    a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0,
  );
}

/**
 * Only the row's own contributor or the trip creator may toggle a payment
 * (`WhoDepositView.canToggle`).
 */
export function canTogglePayment(
  currentUserId: number | null | undefined,
  rowUserId: number,
  createdById: number | null | undefined,
): boolean {
  if (currentUserId == null) return false;
  return currentUserId === rowUserId || currentUserId === createdById;
}

/**
 * Dynamic sheet height for the paid-progress list — generous per-row estimates so the detent
 * is ≥ content for typical counts (`PaidProgressBottomSheet.sheetHeight`).
 */
export function paidProgressSheetHeight(count: number): number {
  const base = 150;
  const rowHeight = 90;
  return Math.min(Math.max(base + rowHeight * count, 220), 600);
}
