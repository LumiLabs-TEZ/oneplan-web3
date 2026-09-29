/**
 * Add-expense details form — port of the state in
 * `ios/OnePlan/OnePlan/View/Expense/AddExpenseDetailsSheet.swift` (`toggleShare`, `canSubmit`,
 * `shareMemberIdsToSave`) and the payload mapping in `TripDetailView.submitExpense`
 * (`View/Trip/TripDetailView.swift:1456-1494`).
 */
import type { components } from '@/api/schema';
import { originalPayload } from '@/features/trip/helpers/tripCurrencyRules';
import type { Currency } from '@/lib/currency';

import type { ExpenseCategory } from './categories';

type CreateExpenseDto = components['schemas']['CreateExpenseDto'];
type TripMemberDto = components['schemas']['TripMemberDto'];

export type ShareMode = { type: 'all' } | { type: 'members'; ids: number[] };
/** `.group` → `paidByGroup: true` (server stores payer null = shared wallet). */
export type PaidBy = { type: 'group' } | { type: 'member'; userId: number };

export interface DetailsFormState {
  name: string;
  category: ExpenseCategory;
  shareMode: ShareMode;
  paidBy: PaidBy;
}

export type DetailsFormAction =
  | { type: 'setName'; name: string }
  | { type: 'setCategory'; category: ExpenseCategory }
  | { type: 'toggleMember'; userId: number }
  | { type: 'selectAll' }
  | { type: 'setPaidBy'; paidBy: PaidBy };

export function initialDetailsForm(overrides: Partial<DetailsFormState> = {}): DetailsFormState {
  return {
    name: '',
    category: 'FOOD',
    shareMode: { type: 'all' },
    paidBy: { type: 'group' },
    ...overrides,
  };
}

export function acceptedMemberIds(members: readonly TripMemberDto[]): number[] {
  return members.filter((m) => m.inviteStatus === 'ACCEPTED').map((m) => m.userId);
}

/**
 * First individual tap turns "All" off and selects only that member; deselecting the last
 * member falls back to "All" instead of leaving an unsubmittable empty split.
 */
export function toggleMember(mode: ShareMode, userId: number): ShareMode {
  if (mode.type === 'all') return { type: 'members', ids: [userId] };
  if (mode.ids.includes(userId)) {
    const ids = mode.ids.filter((id) => id !== userId);
    return ids.length === 0 ? { type: 'all' } : { type: 'members', ids };
  }
  return { type: 'members', ids: [...mode.ids, userId] };
}

export function detailsFormReducer(
  state: DetailsFormState,
  action: DetailsFormAction,
): DetailsFormState {
  switch (action.type) {
    case 'setName':
      return { ...state, name: action.name };
    case 'setCategory':
      return { ...state, category: action.category };
    case 'toggleMember':
      return { ...state, shareMode: toggleMember(state.shareMode, action.userId) };
    case 'selectAll':
      return { ...state, shareMode: { type: 'all' } };
    case 'setPaidBy':
      return { ...state, paidBy: action.paidBy };
  }
}

export function shareMemberIds(mode: ShareMode, accepted: readonly number[]): number[] {
  return mode.type === 'all' ? [...accepted] : accepted.filter((id) => mode.ids.includes(id));
}

/**
 * Whether a member chip shows as selected. Like iOS (`selectedShareUserIds.contains`, cleared
 * when "All" is picked), only explicitly picked members light up — under "All" just the All
 * chip is highlighted, even though everyone shares the expense (`shareMemberIds`).
 */
export function isMemberSelected(mode: ShareMode, userId: number): boolean {
  return mode.type === 'members' && mode.ids.includes(userId);
}

export function canSubmit(state: DetailsFormState, accepted: readonly number[]): boolean {
  return state.name.trim().length > 0 && shareMemberIds(state.shareMode, accepted).length > 0;
}

export interface CreateBodyInput {
  form: DetailsFormState;
  members: readonly TripMemberDto[];
  amount: number;
  enteredCurrency: Currency;
  homeCurrency: Currency;
  displayCurrencies: readonly Currency[];
  now: Date;
  /** Localized fallback name when the user left the field blank (`t('Expense')`). */
  fallbackName: string;
}

export function toCreateBody({
  form,
  members,
  amount,
  enteredCurrency,
  homeCurrency,
  displayCurrencies,
  now,
  fallbackName,
}: CreateBodyInput): CreateExpenseDto {
  const name = form.name.trim() || fallbackName;
  const original = originalPayload({ amount, enteredCurrency, homeCurrency, displayCurrencies });
  const body: CreateExpenseDto = {
    name,
    amount,
    category: form.category,
    memberIds: shareMemberIds(form.shareMode, acceptedMemberIds(members)),
    expenseDate: now.toISOString(),
  };
  if (form.paidBy.type === 'member') body.paidById = form.paidBy.userId;
  else body.paidByGroup = true;
  if (original.originalAmount !== undefined && original.originalCurrency) {
    body.originalAmount = original.originalAmount;
    body.originalCurrency = original.originalCurrency.code as CreateExpenseDto['originalCurrency'];
  }
  return body;
}
