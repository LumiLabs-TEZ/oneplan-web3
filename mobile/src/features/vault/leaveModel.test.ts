import {
  grossDeposit,
  hostLeaveDisplay,
  hostLeaveSheetHeight,
  memberLeaveSheetHeight,
  memberLeaveState,
  oldestPendingRequest,
  shortenAddress,
  signedUsdcPrefix,
} from './leaveModel';

describe('grossDeposit', () => {
  it('is 0 for a non-positive net', () => {
    expect(grossDeposit(0)).toBe(0);
    expect(grossDeposit(-100)).toBe(0);
  });

  it('grosses up by the 0.1% skim, floor-divided like the Swift original', () => {
    // ceil(100 * 10_000 / 9_990) = ceil(100.1001...) = 101
    expect(grossDeposit(100)).toBe(101);
    // ceil(1_000_000 * 10_000 / 9_990) = ceil(1_001_001.0...) = 1_001_002
    expect(grossDeposit(1_000_000)).toBe(1_001_002);
  });
});

describe('memberLeaveState', () => {
  const base = { lines: [], leaveRequestPending: false };

  it('treats sub-dust debt as allGood (dust waived)', () => {
    const state = memberLeaveState({ ...base, netMicro: '-9999', owedMicro: '9999' });
    expect(state.kind).toBe('allGood');
    expect(state.heroAmountMicro).toBe(0);
  });

  it('is owe exactly at the dust boundary (inclusive)', () => {
    const state = memberLeaveState({ ...base, netMicro: '-10000', owedMicro: '10000' });
    expect(state.kind).toBe('owe');
    expect(state.heroAmountMicro).toBe(10_000);
    expect(state.depositGrossMicro).toBeGreaterThan(10_000);
    expect(state.canTapAnnounce).toBe(false);
  });

  it('is receive exactly at the dust boundary (inclusive)', () => {
    const state = memberLeaveState({ ...base, netMicro: '10000', owedMicro: '0' });
    expect(state.kind).toBe('receive');
    expect(state.heroAmountMicro).toBe(10_000);
    expect(state.canTapAnnounce).toBe(true);
  });

  it('sub-dust receive is allGood too', () => {
    const state = memberLeaveState({ ...base, netMicro: '9999', owedMicro: '0' });
    expect(state.kind).toBe('allGood');
    expect(state.canTapAnnounce).toBe(true);
  });

  it('blocks announce while owing, even if canAnnounce was stale-true', () => {
    const state = memberLeaveState({ ...base, netMicro: '-50000', owedMicro: '50000' });
    expect(state.canTapAnnounce).toBe(false);
  });

  it('blocks announce while a request is already pending', () => {
    const state = memberLeaveState({
      lines: [],
      leaveRequestPending: true,
      netMicro: '0',
      owedMicro: '0',
    });
    expect(state.canTapAnnounce).toBe(false);
  });

  it('sums deposits and expenses from the ledger lines separately by sign', () => {
    const state = memberLeaveState({
      leaveRequestPending: false,
      netMicro: '0',
      owedMicro: '0',
      lines: [
        { title: 'Deposit', amountMicro: '5000000', kind: 'DEPOSIT', time: '10:00' },
        { title: 'Coffee', amountMicro: '-1200000', kind: 'SPEND', time: '11:00' },
        { title: 'Taxi', amountMicro: '-800000', kind: 'SPEND', time: '12:00' },
      ],
    });
    expect(state.totalDepositedMicro).toBe(5_000_000);
    expect(state.totalExpensesMicro).toBe(-2_000_000);
  });
});

describe('hostLeaveDisplay', () => {
  it('phase=left always shows 0 with no badge', () => {
    const display = hostLeaveDisplay(
      { netMicro: '999999', announcedNetMicro: '999999', status: 'READY' },
      'left',
    );
    expect(display).toEqual({ isPayout: false, displayAmountMicro: 0, statusBadge: null });
  });

  it('WAITING_DEPOSIT shows the absolute owed amount, floored below dust', () => {
    const display = hostLeaveDisplay(
      { netMicro: '-2000000', announcedNetMicro: '0', status: 'WAITING_DEPOSIT' },
      'request',
    );
    expect(display.displayAmountMicro).toBe(2_000_000);
    expect(display.isPayout).toBe(false);
    expect(display.statusBadge).toBe('waiting');
  });

  it('PAYOUT at or above dust is a real payout with no badge (address card shown instead)', () => {
    const display = hostLeaveDisplay(
      { netMicro: '3000000', announcedNetMicro: '3000000', status: 'PAYOUT' },
      'request',
    );
    expect(display.isPayout).toBe(true);
    expect(display.displayAmountMicro).toBe(3_000_000);
    expect(display.statusBadge).toBeNull();
  });

  it('stale PAYOUT under dust is treated like READY (received badge, not a real payout)', () => {
    const display = hostLeaveDisplay(
      { netMicro: '5000', announcedNetMicro: '5000', status: 'PAYOUT' },
      'request',
    );
    expect(display.isPayout).toBe(false);
    expect(display.displayAmountMicro).toBe(0);
    expect(display.statusBadge).toBe('received');
  });

  it('READY shows the announced amount, floored at 0', () => {
    const display = hostLeaveDisplay(
      { netMicro: '0', announcedNetMicro: '1500000', status: 'READY' },
      'request',
    );
    expect(display.displayAmountMicro).toBe(1_500_000);
    expect(display.statusBadge).toBe('received');
  });
});

describe('signedUsdcPrefix', () => {
  it('returns the sign, or empty for exactly zero', () => {
    expect(signedUsdcPrefix(-1)).toBe('-');
    expect(signedUsdcPrefix(1)).toBe('+');
    expect(signedUsdcPrefix(0)).toBe('');
  });
});

describe('shortenAddress', () => {
  it('shortens a long address to head...tail', () => {
    expect(shortenAddress('HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL')).toBe('HcBi...tLAL');
  });

  it('leaves a short address untouched and null becomes null', () => {
    expect(shortenAddress('abc123')).toBe('abc123');
    expect(shortenAddress(null)).toBeNull();
    expect(shortenAddress(undefined)).toBeNull();
  });
});

describe('sheet heights', () => {
  it('member sheet grows with line count, clamped 520-720', () => {
    expect(memberLeaveSheetHeight(0)).toBe(520);
    expect(memberLeaveSheetHeight(1)).toBe(520);
    expect(memberLeaveSheetHeight(20)).toBe(720);
  });

  it('host sheet is a fixed 560/420 by payout state', () => {
    expect(hostLeaveSheetHeight(true)).toBe(560);
    expect(hostLeaveSheetHeight(false)).toBe(420);
  });
});

describe('oldestPendingRequest', () => {
  const mk = (userId: number, requestedAt: string) => ({
    tripId: 1,
    userId,
    displayName: `User ${userId}`,
    netMicro: '0',
    announcedNetMicro: '0',
    status: 'READY',
    requestedAt,
  });

  it('picks the oldest by requestedAt, skipping dismissed users', () => {
    const requests = [mk(1, '2026-09-28T10:00:00Z'), mk(2, '2026-09-28T09:00:00Z')];
    expect(oldestPendingRequest(requests, new Set())?.userId).toBe(2);
    expect(oldestPendingRequest(requests, new Set([2]))?.userId).toBe(1);
    expect(oldestPendingRequest(requests, new Set([1, 2]))).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(oldestPendingRequest([], new Set())).toBeNull();
  });
});
