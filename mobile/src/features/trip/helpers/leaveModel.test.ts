import en from '@/i18n/locales/en.json';
import type { TranslateFn } from '@/ui/relativeTime';

import { leaveSheetHeight, netSettlementText } from './leaveModel';

const table = en as Record<string, string>;
const t: TranslateFn = (key, options) =>
  (table[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ''));

describe('leaveSheetHeight', () => {
  it('is the base chrome (400) with no budgets', () => {
    expect(leaveSheetHeight(0)).toBe(400);
  });

  it('adds the budget rows + section padding, capped at 600', () => {
    // 220 + (2*54 + 100) + 180 = 608, capped to 600.
    expect(leaveSheetHeight(2)).toBe(600);
  });

  it('does not cap when under the ceiling', () => {
    // 220 + (1*54 + 100) + 180 = 554
    expect(leaveSheetHeight(1)).toBe(554);
  });
});

describe('netSettlementText', () => {
  it('shows a green refund string when the member is owed money', () => {
    expect(netSettlementText(350_000, 'đ', t)).toEqual({
      text: '+350,000đ (refund)',
      tone: 'green',
    });
  });

  it('shows a red owe string when the member owes the group', () => {
    expect(netSettlementText(-150_000, 'đ', t)).toEqual({
      text: '-150,000đ (you owe)',
      tone: 'red',
    });
  });

  it('shows Settled at exactly zero', () => {
    expect(netSettlementText(0, 'đ', t)).toEqual({ text: 'Settled', tone: 'muted' });
  });
});
