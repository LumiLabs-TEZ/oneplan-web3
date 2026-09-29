import {
  avatarUrlFor,
  mapCashDebtToEntry,
  microToUsdc,
  settlementNetUsdc,
} from './tripEndSettlement';
import type { CashDebtDto } from '../api/endTrip';

function debt(overrides: Partial<CashDebtDto> = {}): CashDebtDto {
  return {
    fromUserId: 2,
    fromDisplayName: 'Shin',
    toUserId: 1,
    toDisplayName: 'Hyydesi',
    amountMicro: '1500000',
    isConfirmed: false,
    canConfirm: true,
    lines: [],
    toWalletAddress: null,
    ...overrides,
  };
}

describe('microToUsdc', () => {
  it('converts a micro-USDC decimal string to USDC', () => {
    expect(microToUsdc('1500000')).toBe(1.5);
  });

  it('handles dust amounts (sub-cent micro-USDC) without losing precision', () => {
    expect(microToUsdc('1')).toBeCloseTo(0.000001, 6);
  });

  it('falls back to 0 for a malformed string', () => {
    expect(microToUsdc('not-a-number')).toBe(0);
  });
});

describe('mapCashDebtToEntry', () => {
  it('marks the row "receiving" and hides the wallet address when I am the creditor', () => {
    const entry = mapCashDebtToEntry(
      debt({ toUserId: 1, fromUserId: 2, toWalletAddress: 'abc123' }),
      /* myUserId */ 1,
      26_500,
    );
    expect(entry.direction).toBe('receiving');
    expect(entry.id).toBe(2);
    expect(entry.name).toBe('Shin');
    expect(entry.walletAddress).toBeNull();
    expect(entry.amountUsdc).toBe(1.5);
    expect(entry.amount).toBe(1.5 * 26_500);
  });

  it('marks the row "paying" and surfaces the creditor wallet address when I am the debtor', () => {
    const entry = mapCashDebtToEntry(
      debt({ toUserId: 1, fromUserId: 2, toWalletAddress: 'abc123' }),
      /* myUserId */ 2,
      26_500,
    );
    expect(entry.direction).toBe('paying');
    expect(entry.id).toBe(1);
    expect(entry.name).toBe('Hyydesi');
    expect(entry.walletAddress).toBe('abc123');
  });

  it('maps isConfirmed to the markedDone row state', () => {
    expect(mapCashDebtToEntry(debt({ isConfirmed: true }), 1, 26_500).state).toBe('markedDone');
    expect(mapCashDebtToEntry(debt({ isConfirmed: false }), 1, 26_500).state).toBe('outstanding');
  });

  it('forwards server-computed canConfirm unchanged — only the creditor may confirm', () => {
    expect(mapCashDebtToEntry(debt({ canConfirm: true }), 1, 26_500).canConfirm).toBe(true);
    expect(mapCashDebtToEntry(debt({ canConfirm: false }), 2, 26_500).canConfirm).toBe(false);
  });

  it('converts every line to VND at the given rate, preserving dust in the USDC figure', () => {
    const entry = mapCashDebtToEntry(
      debt({
        amountMicro: '1200000',
        lines: [
          { title: 'Lẩu bò Nhà Gỗ', amountMicro: '1000000' },
          { title: 'Homestay', amountMicro: '200000' },
        ],
      }),
      1,
      26_500,
    );
    expect(entry.lines).toEqual([
      { title: 'Lẩu bò Nhà Gỗ', amount: 26_500, amountUsdc: 1 },
      { title: 'Homestay', amount: 5_300, amountUsdc: 0.2 },
    ]);
  });

  it('attaches the resolved counterparty avatar when given one', () => {
    const entry = mapCashDebtToEntry(debt(), 1, 26_500, 'https://example.com/a.png');
    expect(entry.avatarUrls).toEqual(['https://example.com/a.png']);
  });
});

describe('avatarUrlFor', () => {
  it('finds the member by id', () => {
    expect(avatarUrlFor([{ userId: 2, avatarUrl: 'x.png' }], 2)).toBe('x.png');
  });

  it('returns null when the member is not found', () => {
    expect(avatarUrlFor([], 2)).toBeNull();
  });
});

describe('settlementNetUsdc', () => {
  it('sums to a positive net when the caller is owed more than they owe', () => {
    const debts = [
      debt({ toUserId: 1, fromUserId: 2, amountMicro: '2000000' }),
      debt({ toUserId: 3, fromUserId: 1, amountMicro: '500000' }),
    ];
    expect(settlementNetUsdc(debts, 1)).toBe(1.5);
  });

  it('sums to a negative net when the caller owes more than they are owed', () => {
    const debts = [
      debt({ toUserId: 1, fromUserId: 2, amountMicro: '500000' }),
      debt({ toUserId: 3, fromUserId: 1, amountMicro: '2000000' }),
    ];
    expect(settlementNetUsdc(debts, 1)).toBe(-1.5);
  });

  it('returns 0 for an empty settlement (dust cancels out cleanly)', () => {
    expect(settlementNetUsdc([], 1)).toBe(0);
  });
});
