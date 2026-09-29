/**
 * Front-of-`HomeCard` money summary — port of the balance/usage-pill semantics in
 * `HomeCard.swift` (`balance`, `usagePercent`): balance only counts *paid* budget payments
 * (unpaid pledges aren't real money yet), while spend is the raw expense total.
 */
import type { BudgetDto, ExpenseSummaryDto } from '../types';

export interface TripMoney {
  totalBudget: number;
  totalSpent: number;
  balance: number;
  /** 0-100, clamped at 0 (a deficit still shows an empty track, not a negative fill). */
  usagePercent: number;
  unsettledPaymentCount: number;
}

export function tripMoney(budgets: BudgetDto[], expenses: ExpenseSummaryDto[]): TripMoney {
  const totalBudget = budgets.reduce(
    (s, b) => s + b.payments.filter((p) => p.isPaid).reduce((a, p) => a + p.amount, 0),
    0,
  );
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const balance = totalBudget - totalSpent;
  const usagePercent =
    totalBudget > 0 ? Math.max(Math.trunc(((totalBudget - totalSpent) / totalBudget) * 100), 0) : 0;
  const unsettledPaymentCount = budgets.flatMap((b) => b.payments).filter((p) => !p.isPaid).length;
  return { totalBudget, totalSpent, balance, usagePercent, unsettledPaymentCount };
}
