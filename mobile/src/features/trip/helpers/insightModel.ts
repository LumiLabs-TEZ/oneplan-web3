/**
 * Insight tab math — port of `TripInsightSection.PersonalInsight` / `GroupInsight` (iOS
 * `ios/OnePlan/OnePlan/Component/Trip/TripInsightSection.swift:296-364`).
 *
 * Personal uses the signed-in member's *share* of spend (`totalShare`, not what they paid)
 * and their `netBalance` ("Remaining" — negative means they owe the group). Group uses
 * `tripMoney()` (paid-budget totals) the same way `HomeCard` does. Category totals fold a
 * different source per scope: personal folds `member.expenses[].shareAmount` looked up
 * against the category on the matching `ExpenseSummaryDto`; group folds the raw
 * `expense.amount`.
 */
import type { ExpenseCategory } from '@/features/expense/categories';
import { EXPENSE_CATEGORIES } from '@/features/expense/categories';

import { tripMoney } from './tripMoney';
import type { BudgetDto, ExpenseSummaryDto, TripBreakdownDto } from '../types';

export type InsightScope = 'personal' | 'group';

export interface CategorySpend {
  category: ExpenseCategory;
  amount: number;
}

export interface PersonalInsight {
  myExpenses: number;
  remaining: number;
  isOver: boolean;
  categories: CategorySpend[];
}

export interface GroupInsight {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  categories: CategorySpend[];
}

/** `null` when the current user isn't (yet) a `breakdown.members` row — e.g. still loading. */
export function personalInsight(
  breakdown: TripBreakdownDto,
  expenses: ExpenseSummaryDto[],
  me: number,
): PersonalInsight | null {
  const member = breakdown.members.find((m) => m.userId === me);
  if (!member) return null;

  const myExpenses = member.totalShare;
  const remaining = member.netBalance;

  const totals: Partial<Record<ExpenseCategory, number>> = {};
  for (const share of member.expenses) {
    const category = expenses.find((e) => e.id === share.expenseId)?.category ?? 'OTHER';
    totals[category] = (totals[category] ?? 0) + share.shareAmount;
  }

  return {
    myExpenses,
    remaining,
    isOver: remaining < 0,
    categories: orderedCategories(totals),
  };
}

export function groupInsight(
  // Unused today — `tripMoney()` + `expenses` already carry group totals — but kept in the
  // signature so call sites can pass the same `breakdown` they hold for `personalInsight`
  // without threading an extra conditional; `TripBreakdownDto | undefined` matches
  // `TripDetail.breakdown` directly (it's `undefined` while the query is still loading).
  breakdown: TripBreakdownDto | undefined,
  budgets: BudgetDto[],
  expenses: ExpenseSummaryDto[],
): GroupInsight {
  const money = tripMoney(budgets, expenses);

  const totals: Partial<Record<ExpenseCategory, number>> = {};
  for (const expense of expenses) {
    totals[expense.category] = (totals[expense.category] ?? 0) + expense.amount;
  }

  return {
    totalBudget: money.totalBudget,
    totalSpent: money.totalSpent,
    remaining: money.balance,
    categories: orderedCategories(totals),
  };
}

/**
 * Non-zero categories in canonical `EXPENSE_CATEGORIES` order (`OTHER` is already last),
 * mirroring `CategorySpendRow.makeList` on iOS.
 */
export function orderedCategories(map: Partial<Record<ExpenseCategory, number>>): CategorySpend[] {
  return EXPENSE_CATEGORIES.filter((opt) => (map[opt.value] ?? 0) > 0).map((opt) => ({
    category: opt.value,
    amount: map[opt.value] ?? 0,
  }));
}
