import { CURRENCIES } from '@/lib/currency';
import {
  assignmentReducer,
  createAssignmentState,
  memberTotal,
  receiptCurrency,
  receiptPayload,
} from './assignment';
import fixture from './fixtures/receipt.json';
const members = fixture.members.map((m) => ({
  id: m.userId,
  userId: m.userId,
  displayName: m.name,
  inviteStatus: 'ACCEPTED' as const,
  role: 'MEMBER' as const,
  isPro: false,
}));
function session() {
  let id = 0;
  return createAssignmentState(fixture.receipt, members, CURRENCIES.THB, () =>
    String(++id).padStart(3, '0'),
  );
}

describe('receipt assignment', () => {
  it('uses accepted members only and stable session identities through undo/reset', () => {
    let id = 0;
    const state = createAssignmentState(
      fixture.receipt,
      [...members, { ...members[0]!, inviteStatus: 'PENDING' }],
      CURRENCIES.THB,
      () => String(++id),
    );
    expect(state.members).toHaveLength(3);
    const reset = assignmentReducer(state, { type: 'reset' });
    expect(reset.items).toBe(state.items);
    expect(reset.members).toBe(state.members);
  });
  it('consumes quantities, keeps exhausted items, and ignores invalid drops', () => {
    const start = session();
    const itemId = start.items[0]!.id;
    const memberId = start.members[0]!.id;
    const event = { type: 'assign' as const, itemId, memberIds: [memberId] };
    let state = assignmentReducer(start, event);
    expect(state.remaining[itemId]).toBe(1);
    expect(memberTotal(state, memberId)).toBe(5000);
    state = assignmentReducer(state, event);
    expect(state.remaining[itemId]).toBe(0);
    expect(state.items).toHaveLength(4);
    expect(assignmentReducer(state, event)).toBe(state);
    expect(assignmentReducer(start, { ...event, itemId: 'missing' })).toBe(start);
    expect(assignmentReducer(start, { ...event, memberIds: [] })).toBe(start);
    expect(assignmentReducer(start, { ...event, memberIds: ['invalid', memberId] })).toBe(start);
  });
  it('sorts UUIDs, deduplicates members and undoes the whole split atomically', () => {
    const state = session();
    const itemId = state.items[1]!.id;
    const ids = state.members.map((m) => m.id).reverse();
    const assigned = assignmentReducer(state, {
      type: 'assign',
      itemId,
      memberIds: [...ids, ids[0]!],
    });
    expect(assigned.history[0]?.assignments).toEqual([
      { memberId: '005', amountMinor: 1501 },
      { memberId: '006', amountMinor: 1500 },
      { memberId: '007', amountMinor: 1500 },
    ]);
    expect(assignmentReducer(assigned, { type: 'undo' })).toEqual(state);
    expect(assignmentReducer(assigned, { type: 'reset' })).toEqual(state);
  });
  it('matches Swift quantity division without redistributing the quantity remainder', () => {
    const state = session();
    state.items[0]!.totalMinor = 10001;
    const once = assignmentReducer(state, {
      type: 'assign',
      itemId: state.items[0]!.id,
      memberIds: [state.members[0]!.id],
    });
    const twice = assignmentReducer(once, {
      type: 'assign',
      itemId: state.items[0]!.id,
      memberIds: [state.members[0]!.id],
    });
    expect(memberTotal(twice, state.members[0]!.id)).toBe(10000);
  });
  it('allows a partial receipt and converts minor units back into the JSON major amounts', () => {
    const state = session();
    const assigned = assignmentReducer(state, {
      type: 'assign',
      itemId: state.items[1]!.id,
      memberIds: [state.members[0]!.id],
    });
    const date = new Date('2026-09-18T10:00:00.000Z');
    expect(
      receiptPayload(assigned, CURRENCIES.THB, CURRENCIES.USD, 'Lunch', 'Receipt: Lunch', date),
    ).toEqual({
      name: 'Lunch',
      category: 'FOOD',
      note: 'Receipt: Lunch',
      expenseDate: date.toISOString(),
      originalCurrency: 'THB',
      items: [{ name: 'Americano', amount: 45.01, userId: 1 }],
    });
    expect(
      receiptPayload(assigned, CURRENCIES.THB, CURRENCIES.THB, '', '', date),
    ).not.toHaveProperty('originalCurrency');
  });
  it('handles zero-decimal currencies and drops rows that cannot be represented safely', () => {
    const state = createAssignmentState(fixture.receipt, members, CURRENCIES.VND, () => 'id');
    expect(state.items[0]!.totalMinor).toBe(100);
    const bad = createAssignmentState(
      { items: [{ name: 'bad', quantity: 1, unitPrice: Infinity, totalPrice: Infinity }] },
      members,
      CURRENCIES.USD,
      () => 'id',
    );
    expect(bad.items).toEqual([]);
  });
  it('drops complimentary and discount rows the server would reject, keeping order', () => {
    let id = 0;
    const state = createAssignmentState(
      {
        items: [
          { name: 'Water', quantity: 1, unitPrice: 0, totalPrice: 0 },
          { name: 'Tea', quantity: 2, unitPrice: 4, totalPrice: 8 },
          { name: 'Discount', quantity: 1, unitPrice: -20, totalPrice: -20 },
          { name: 'Rice', quantity: 1, unitPrice: 12, totalPrice: 12 },
        ],
      },
      members,
      CURRENCIES.THB,
      () => `i${++id}`,
    );
    expect(state.items.map((i) => i.name)).toEqual(['Tea', 'Rice']);
    expect(Object.keys(state.remaining)).toEqual(['i1', 'i2']);
  });
  it('never sends a zero share and clamps name and note to the server limits', () => {
    const state = createAssignmentState(
      { items: [{ name: 'Mint', quantity: 1, unitPrice: 0.01, totalPrice: 0.01 }] },
      members,
      CURRENCIES.THB,
      (() => {
        let id = 0;
        return () => `id${++id}`;
      })(),
    );
    const split = assignmentReducer(state, {
      type: 'assign',
      itemId: state.items[0]!.id,
      memberIds: [state.members[0]!.id, state.members[1]!.id],
    });
    expect(split.history[0]!.assignments.map((a) => a.amountMinor)).toEqual([1, 0]);
    const payload = receiptPayload(
      split,
      CURRENCIES.THB,
      CURRENCIES.THB,
      'n'.repeat(300),
      'x'.repeat(600),
      new Date(0),
    );
    expect(payload.items).toEqual([{ name: 'Mint', amount: 0.01, userId: 1 }]);
    expect(payload.name).toHaveLength(255);
    expect(payload.note).toHaveLength(500);
  });
});
it('resolves local → home → supported detected (uppercase) → VND', () => {
  expect(receiptCurrency('THB', 'USD', 'EUR')).toEqual(CURRENCIES.THB);
  expect(receiptCurrency(undefined, 'USD', 'EUR')).toEqual(CURRENCIES.USD);
  expect(receiptCurrency(undefined, undefined, 'eur')).toEqual(CURRENCIES.EUR);
  expect(receiptCurrency(undefined, undefined, '฿')).toEqual(CURRENCIES.VND);
});
