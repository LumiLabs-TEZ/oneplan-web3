import { historyTotalOf, mapHistoryEntry } from './tripEndHistory';
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
    expect(mapped.secondaryVnd).toBeNull();
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

  it('an expense is negative USDC and keeps its VND face value as secondary', () => {
    const mapped = mapHistoryEntry(entry({ amountVnd: '1000000', amountMicro: '38000000' }), true);
    expect(mapped.kind).toBe('expense');
    expect(mapped.amount).toBe(-38);
    expect(mapped.secondaryVnd).toBe(1000000);
  });

  it('an expense with no VND face value has no secondary', () => {
    const mapped = mapHistoryEntry(entry({ amountVnd: null, amountMicro: '3000000' }), true);
    expect(mapped.amount).toBe(-3);
    expect(mapped.secondaryVnd).toBeNull();
  });

  it('formats the time from createdAt', () => {
    const mapped = mapHistoryEntry(entry({ createdAt: '2026-01-01T10:30:00.000Z' }), true);
    expect(mapped.time).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('historyTotalOf', () => {
  it('sums deposits and spends in USDC', () => {
    const deposit = mapHistoryEntry(
      entry({ kind: 'DEPOSIT', amountMicro: '2000000', amountVnd: null }),
      true,
    );
    const spend = mapHistoryEntry(entry({ amountVnd: '26500000', amountMicro: '1000000' }), true);
    expect(historyTotalOf([deposit, spend])).toBe(1);
  });

  it('returns 0 for an empty ledger', () => {
    expect(historyTotalOf([])).toBe(0);
  });
});
