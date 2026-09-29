/**
 * Pure model for the leave-trip sheet — port of `LeaveTripBottomSheet.swift`'s
 * `sheetHeight` (:258-263) and `netSettlementText`/`netSettlementColor` (:236-256).
 */
import { formatWhole } from '@/lib/currency';
import type { TranslateFn } from '@/ui/relativeTime';

/**
 * `min(220 + (n ? n*54 + 100 : 0) + 180, 600)` — base header/footer chrome (220 + 180) plus the
 * budget section's row list (`n*54`) and its own padding/heading (100) when there are budgets.
 */
export function leaveSheetHeight(budgetCount: number): number {
  const budgetSection = budgetCount > 0 ? budgetCount * 54 + 100 : 0;
  return Math.min(220 + budgetSection + 180, 600);
}

export type NetSettlementTone = 'green' | 'red' | 'muted';

export interface NetSettlementDisplay {
  text: string;
  tone: NetSettlementTone;
}

/**
 * `+{amt}{sym} (refund)` when the member is owed money, `-{abs}{sym} (you owe)` when they owe
 * the group, `Settled` at exactly zero.
 */
export function netSettlementText(
  net: number,
  symbol: string,
  t: TranslateFn,
): NetSettlementDisplay {
  if (net > 0) {
    return { text: t('+%@%@ (refund)', { 0: formatWhole(net), 1: symbol }), tone: 'green' };
  }
  if (net < 0) {
    return {
      text: t('-%@%@ (you owe)', { 0: formatWhole(Math.abs(net)), 1: symbol }),
      tone: 'red',
    };
  }
  return { text: t('Settled'), tone: 'muted' };
}
