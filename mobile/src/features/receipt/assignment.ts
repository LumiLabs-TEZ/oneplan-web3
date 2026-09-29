import type { components } from '@/api/schema';
import { CURRENCIES, currencyFromCode, isCurrencyCode, type Currency } from '@/lib/currency';

type ScanResult = components['schemas']['ReceiptScanResultDto'];
type TripMember = components['schemas']['TripMemberDto'];
/** `CreateReceiptExpenseDto` `@MaxLength` limits. */
export const RECEIPT_NAME_MAX_LENGTH = 255;
export const RECEIPT_NOTE_MAX_LENGTH = 500;
export interface ReceiptMember {
  id: string;
  userId: number;
  name: string;
  imageURL: string;
}
export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  totalMinor: number;
  displayMinor: number;
}
export interface Assignment {
  memberId: string;
  amountMinor: number;
}
export interface AssignmentAction {
  sourceId: string;
  assignments: Assignment[];
}
export interface AssignmentState {
  members: ReceiptMember[];
  items: ReceiptItem[];
  remaining: Record<string, number>;
  history: AssignmentAction[];
}
export type AssignmentEvent =
  { type: 'assign'; itemId: string; memberIds: string[] } | { type: 'undo' } | { type: 'reset' };

export function receiptCurrency(
  local?: string | null,
  home?: string | null,
  detected?: string | null,
): Currency {
  return (
    currencyFromCode(local) ??
    currencyFromCode(home) ??
    currencyFromCode(detected?.toUpperCase()) ??
    CURRENCIES.VND
  );
}

/** UUID generation is injected and runs once at the scan/session boundary, never in the reducer. */
export function createAssignmentState(
  result: ScanResult,
  members: TripMember[],
  currency: Currency,
  uuid: () => string,
): AssignmentState {
  const factor = 10 ** currency.decimalPlaces;
  // Rows the server would reject (`@Min(0.01)`) — complimentary items, discount lines and
  // unrepresentable amounts — are dropped here so they can never poison the whole save.
  const items = result.items.flatMap((item): ReceiptItem[] => {
    const quantity = item.quantity > 1 ? Math.trunc(item.quantity) : 1;
    const totalMinor = Math.round(item.totalPrice * factor);
    const displayMinor = Math.round(
      (item.quantity > 1 ? item.unitPrice : item.totalPrice) * factor,
    );
    if (
      ![totalMinor, displayMinor, quantity].every(Number.isSafeInteger) ||
      totalMinor <= 0 ||
      displayMinor < 0
    )
      return [];
    return [{ id: uuid(), name: item.name, quantity, totalMinor, displayMinor }];
  });
  return {
    members: members
      .filter((m) => m.inviteStatus === 'ACCEPTED')
      .map((m) => ({
        id: uuid(),
        userId: m.userId,
        name: m.displayName,
        imageURL: m.avatarUrl ?? '',
      })),
    items,
    remaining: Object.fromEntries(items.map((i) => [i.id, i.quantity])),
    history: [],
  };
}

/** Swift truncates total / quantity; only the subsequent split remainder is distributed. */
export function assignmentReducer(state: AssignmentState, event: AssignmentEvent): AssignmentState {
  if (event.type === 'reset')
    return {
      ...state,
      remaining: Object.fromEntries(state.items.map((i) => [i.id, i.quantity])),
      history: [],
    };
  if (event.type === 'undo') {
    const last = state.history.at(-1);
    if (!last) return state;
    return {
      ...state,
      remaining: { ...state.remaining, [last.sourceId]: (state.remaining[last.sourceId] ?? 0) + 1 },
      history: state.history.slice(0, -1),
    };
  }
  const item = state.items.find((i) => i.id === event.itemId);
  const ids = [...new Set(event.memberIds)].sort();
  if (
    !item ||
    (state.remaining[item.id] ?? 0) <= 0 ||
    !ids.length ||
    ids.some((id) => !state.members.some((m) => m.id === id))
  )
    return state;
  const unitMinor = Math.trunc(item.totalMinor / item.quantity);
  const share = Math.trunc(unitMinor / ids.length);
  const remainder = unitMinor % ids.length;
  return {
    ...state,
    remaining: { ...state.remaining, [item.id]: state.remaining[item.id]! - 1 },
    history: [
      ...state.history,
      {
        sourceId: item.id,
        assignments: ids.map((memberId, index) => ({
          memberId,
          amountMinor: share + (index < remainder ? 1 : 0),
        })),
      },
    ],
  };
}

export function memberTotal(state: AssignmentState, memberId: string): number | undefined {
  const assignments = state.history
    .flatMap((a) => a.assignments)
    .filter((a) => a.memberId === memberId);
  return assignments.length ? assignments.reduce((sum, a) => sum + a.amountMinor, 0) : undefined;
}

export function receiptPayload(
  state: AssignmentState,
  currency: Currency,
  home: Currency,
  name: string,
  note: string,
  now: Date,
): components['schemas']['CreateReceiptExpenseDto'] {
  if (!isCurrencyCode(currency.code)) throw new Error('Unsupported original currency');
  return {
    name: name.slice(0, RECEIPT_NAME_MAX_LENGTH),
    category: 'FOOD',
    note: note.slice(0, RECEIPT_NOTE_MAX_LENGTH),
    expenseDate: now.toISOString(),
    // A 1-minor-unit item split n ways leaves zero shares; the server rejects `amount: 0`.
    items: state.history.flatMap((action) =>
      action.assignments
        .filter((a) => a.amountMinor > 0)
        .map((a) => ({
          name: state.items.find((i) => i.id === action.sourceId)!.name,
          amount: a.amountMinor / 10 ** currency.decimalPlaces,
          userId: state.members.find((m) => m.id === a.memberId)!.userId,
        })),
    ),
    ...(currency.code !== home.code ? { originalCurrency: currency.code } : {}),
  };
}
