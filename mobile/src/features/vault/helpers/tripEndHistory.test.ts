import { historyCurrencyOf, historyTotalOf, mapHistoryEntry } from './tripEndHistory';
import type { VaultHistoryEntryDto } from '../api/queries';

function entry(over: Partial<VaultHistoryEntryDto> = {}): VaultHistoryEntryDto {
  return {
    id: 1,
    kind: 'SPEND',
    status: 'CONFIRMED',
    needsApproval: false,
    recipient: null,
    amountMicro: '1000000',
    amountVnd: '26500000',
    title: 'Lẩu bò',
    category: 'FOOD',
    paidBy: null,
    shareWith: [],
    fromAddress: null,
    signature: null,
    createdAt: '2026-01-01T10:30:00.000Z',
    ...over,
  };
}

describe('mapHistoryEntry', () => {
  it('a deposit is positive, in USD, using the USDC face value', () => {
    const mapped = mapHistoryEntry(
      entry({ kind: 'DEPOSIT', amountMicro: '2000000', amountVnd: null, title: null }),
      true,
    );
    expect(mapped.kind).toBe('deposit');
    expect(mapped.amount).toBe(2);
    expect(mapped.currency).toBe('USD');
  });

  it('a settlement is positive, in USD, and carries the recipient name', () => {
    const mapped = mapHistoryEntry(
      entry({
        kind: 'SETTLEMENT',
        amountMicro: '500000',
        amountVnd: null,
        recipient: { userId: 2, displayName: 'Shin', avatarUrl: null },
      }),
      true,
    );
    expect(mapped.kind).toBe('settlement');
    expect(mapped.amount).toBe(0.5);
    expect(mapped.recipientName).toBe('Shin');
  });

  it('an expense with a VND face value is negative, in VND', () => {
    const mapped = mapHistoryEntry(entry({ amountVnd: '1000000' }), true);
    expect(mapped.kind).toBe('expense');
    expect(mapped.amount).toBe(-1000000);
    expect(mapped.currency).toBe('VND');
  });

  it('an expense with no VND face value falls back to the negative USDC amount', () => {
    const mapped = mapHistoryEntry(entry({ amountVnd: null, amountMicro: '3000000' }), true);
    expect(mapped.amount).toBe(-3);
    expect(mapped.currency).toBe('USD');
  });

  it('formats the time from createdAt', () => {
    const mapped = mapHistoryEntry(entry({ createdAt: '2026-01-01T10:30:00.000Z' }), true);
    expect(mapped.time).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('historyCurrencyOf / historyTotalOf', () => {
  it('picks the first non-USD currency, falling back to VND for an all-USD list', () => {
    const usd = mapHistoryEntry(entry({ kind: 'DEPOSIT', amountVnd: null }), true);
    const vnd = mapHistoryEntry(entry({ amountVnd: '1000000' }), true);
    expect(historyCurrencyOf([usd, vnd])).toBe('VND');
    expect(historyCurrencyOf([usd])).toBe('USD');
    expect(historyCurrencyOf([])).toBe('VND');
  });

  it('sums every entry amount regardless of unit (ported iOS behaviour, not real conversion)', () => {
    const usd = mapHistoryEntry(entry({ kind: 'DEPOSIT', amountMicro: '2000000', amountVnd: null }), true);
    const vnd = mapHistoryEntry(entry({ amountVnd: '1000000' }), true);
    expect(historyTotalOf([usd, vnd])).toBe(2 + -1000000);
  });

  it('returns 0 for an empty ledger', () => {
    expect(historyTotalOf([])).toBe(0);
  });
});
