import type { VaultHistoryEntryDto } from '../api/queries';
import {
  dayTotalLabel,
  depositFlowFromHistory,
  groupHistoryByDay,
  hasHistoryDetail,
  mapHistoryEntry,
} from './historyGrouping';

const t = (key: string) => key;

function entry(overrides: Partial<VaultHistoryEntryDto> = {}): VaultHistoryEntryDto {
  return {
    id: 1,
    kind: 'SPEND',
    status: 'CONFIRMED',
    needsApproval: false,
    amountMicro: '7660000',
    shareWith: [],
    createdAt: '2026-01-15T08:18:00.000Z',
    ...overrides,
  };
}

describe('groupHistoryByDay', () => {
  it('groups consecutive same-day entries into one bucket', () => {
    const now = new Date(2026, 0, 20);
    const entries = [
      entry({ id: 1, createdAt: new Date(2026, 0, 15, 8).toISOString() }),
      entry({ id: 2, createdAt: new Date(2026, 0, 15, 9).toISOString() }),
      entry({ id: 3, createdAt: new Date(2026, 0, 14, 8).toISOString() }),
    ];

    const days = groupHistoryByDay(entries, now, 'Today');

    expect(days).toHaveLength(2);
    expect(days[0]!.entries.map((e) => e.id)).toEqual([1, 2]);
    expect(days[1]!.entries.map((e) => e.id)).toEqual([3]);
  });

  it('does not merge two non-adjacent runs of the same day (mirrors Swift single-pass)', () => {
    const now = new Date(2026, 0, 20);
    const entries = [
      entry({ id: 1, createdAt: new Date(2026, 0, 15, 8).toISOString() }),
      entry({ id: 2, createdAt: new Date(2026, 0, 14, 8).toISOString() }),
      entry({ id: 3, createdAt: new Date(2026, 0, 15, 9).toISOString() }),
    ];

    const days = groupHistoryByDay(entries, now, 'Today');

    expect(days).toHaveLength(3);
  });

  it('labels the current local day "Today" and other days as dd/MM/yyyy', () => {
    const now = new Date(2026, 0, 15, 23, 0);
    const entries = [
      entry({ id: 1, createdAt: new Date(2026, 0, 15, 8).toISOString() }),
      entry({ id: 2, createdAt: new Date(2026, 0, 3, 8).toISOString() }),
    ];

    const days = groupHistoryByDay(entries, now, 'Today');

    expect(days[0]!.title).toBe('Today');
    expect(days[1]!.title).toBe('03/01/2026');
  });

  it('buckets by the LOCAL calendar day, not the UTC day', () => {
    // 2026-01-15T23:30 in UTC-8 is still 2026-01-15 locally; construct via local components
    // (not an explicit UTC ISO string) so the test exercises the device's own timezone, exactly
    // like `new Date(iso)` does at runtime.
    const now = new Date(2026, 0, 16, 1, 0); // local 01:00 the next local day
    const lateLocalNight = new Date(2026, 0, 15, 23, 30); // still "today" minus one, locally
    const entries = [entry({ id: 1, createdAt: lateLocalNight.toISOString() })];

    const days = groupHistoryByDay(entries, now, 'Today');

    expect(days[0]!.key).toBe('2026-01-15');
    expect(days[0]!.title).toBe('15/01/2026');
  });

  it('returns an empty array for no entries', () => {
    expect(groupHistoryByDay([], new Date(), 'Today')).toEqual([]);
  });
});

describe('dayTotalLabel', () => {
  it('shows the negative USDC spent on a spend-only day', () => {
    const entries = [
      entry({ kind: 'SPEND', amountMicro: '19000000', amountVnd: '500000' }),
      entry({ kind: 'SPEND', amountMicro: '9500000', amountVnd: '250000' }),
    ];
    expect(dayTotalLabel(entries)).toBe('-$28.50');
  });

  it('shows the net signed USDC total for incoming entries', () => {
    const entries = [
      entry({ kind: 'DEPOSIT', amountMicro: '100000000' }),
      entry({ kind: 'SETTLEMENT', amountMicro: '20000000' }),
    ];
    expect(dayTotalLabel(entries)).toBe('+$120.00');
  });

  it('nets spends against deposits in USDC instead of dropping the deposits', () => {
    const entries = [
      entry({ kind: 'SPEND', amountMicro: '380000', amountVnd: '10000' }),
      entry({ kind: 'DEPOSIT', amountMicro: '100000' }),
      entry({ kind: 'DEPOSIT', amountMicro: '500000' }),
    ];
    expect(dayTotalLabel(entries)).toBe('+$0.22');
  });

  it('returns null when the day nets to zero', () => {
    expect(dayTotalLabel([])).toBeNull();
  });
});

describe('mapHistoryEntry', () => {
  it('maps a group-paid expense (paidBy null) to negative USDC with the VND underneath', () => {
    const row = mapHistoryEntry(
      entry({
        kind: 'SPEND',
        amountMicro: '7660000',
        amountVnd: '200000',
        title: 'Coffee',
        category: 'COFFEE',
      }),
      t,
    );
    expect(row.kind).toEqual({ type: 'expense', paidBy: null, shareWith: [] });
    expect(row.amount).toBe(-7.66);
    expect(row.currency).toBe('USD');
    expect(row.secondaryVnd).toBe(200000);
    expect(row.title).toBe('Coffee');
  });

  it('maps an expense paid by a member', () => {
    const row = mapHistoryEntry(
      entry({
        kind: 'SPEND',
        amountVnd: '100000',
        paidBy: { userId: 1, displayName: 'Cattie', avatarUrl: null },
        shareWith: [{ userId: 2, displayName: 'Nam', avatarUrl: null }],
      }),
      t,
    );
    expect(row.kind).toEqual({
      type: 'expense',
      paidBy: { name: 'Cattie', avatarUrl: null },
      shareWith: [{ name: 'Nam', avatarUrl: null }],
    });
  });

  it('maps a deposit with a positive USD amount and the from-address', () => {
    const row = mapHistoryEntry(
      entry({ kind: 'DEPOSIT', amountMicro: '100000000', fromAddress: 'ABC123' }),
      t,
    );
    expect(row.kind).toEqual({ type: 'deposit', fromAddress: 'ABC123' });
    expect(row.amount).toBe(100);
    expect(row.currency).toBe('USD');
    expect(row.secondaryVnd).toBeNull();
  });

  it('maps a settlement with a positive USD amount and the recipient name', () => {
    const row = mapHistoryEntry(
      entry({
        kind: 'SETTLEMENT',
        amountMicro: '20000000',
        recipient: { userId: 3, displayName: 'Nam', avatarUrl: null },
      }),
      t,
    );
    expect(row.kind).toEqual({ type: 'settlement', toName: 'Nam' });
    expect(row.amount).toBe(20);
    expect(row.currency).toBe('USD');
  });

  it('falls back to a kind-based default title when the server has no name yet', () => {
    expect(mapHistoryEntry(entry({ kind: 'DEPOSIT', title: null }), t).title).toBe('Deposit USDC');
    expect(mapHistoryEntry(entry({ kind: 'SETTLEMENT', title: null }), t).title).toBe('Settlement');
    expect(mapHistoryEntry(entry({ kind: 'REVERT', title: null }), t).title).toBe('Refund');
    expect(mapHistoryEntry(entry({ kind: 'SPEND', title: null }), t).title).toBe('Payment');
  });

  it('carries isAwaitingApproval from needsApproval', () => {
    expect(mapHistoryEntry(entry({ needsApproval: true }), t).isAwaitingApproval).toBe(true);
  });
});

describe('hasHistoryDetail', () => {
  it('opens payments and deposits only', () => {
    expect(hasHistoryDetail(entry({ kind: 'SPEND' }))).toBe(true);
    expect(hasHistoryDetail(entry({ kind: 'DEPOSIT' }))).toBe(true);
    expect(hasHistoryDetail(entry({ kind: 'SETTLEMENT' }))).toBe(false);
    expect(hasHistoryDetail(entry({ kind: 'REVERT' }))).toBe(false);
  });
});

describe('depositFlowFromHistory', () => {
  it('maps a confirmed deposit to a completed receipt from the sender wallet', () => {
    expect(
      depositFlowFromHistory(
        entry({
          kind: 'DEPOSIT',
          amountMicro: '100000',
          fromAddress: 'FKHdAAAAYX56',
          signature: 'sig',
        }),
      ),
    ).toEqual({
      amountMicro: 100000n,
      recipient: 'FKHdAAAAYX56',
      status: 'completed',
      signature: 'sig',
      date: Date.parse('2026-01-15T08:18:00.000Z'),
    });
  });

  it('shows a pending deposit as processing, with no signature yet', () => {
    const flow = depositFlowFromHistory(entry({ kind: 'DEPOSIT', status: 'PENDING' }));
    expect(flow.status).toBe('processing');
    expect(flow.signature).toBe('');
    expect(flow.recipient).toBe('');
  });
});
