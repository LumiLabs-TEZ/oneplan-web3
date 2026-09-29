/**
 * Expense mutations — `TripDetailService.createExpense / updateExpense / deleteExpense`.
 * Each success invalidates the trip's expenses, breakdown and budgets so History and HomeCard
 * refresh; delete also drops the cached detail. Errors are classified for user-facing copy.
 */
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { classifyError, type ClassifiedError } from '@/api/errors';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';

type CreateExpenseDto = components['schemas']['CreateExpenseDto'];
type UpdateExpenseDto = components['schemas']['UpdateExpenseDto'];
type ExpenseDto = components['schemas']['ExpenseDto'];

export class ExpenseMutationError extends Error {
  readonly classified: ClassifiedError;
  constructor(status: number, body: unknown) {
    const classified = classifyError(body, { status });
    super(classified.message);
    this.name = 'ExpenseMutationError';
    this.classified = classified;
  }
}

export async function createExpense(
  tripId: number,
  body: CreateExpenseDto,
  api: ApiClient = defaultApi,
): Promise<ExpenseDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/expenses', {
    params: { path: { tripId } },
    body,
  });
  if (error || !data) throw new ExpenseMutationError(response.status, error);
  return data;
}

export async function updateExpense(
  tripId: number,
  expenseId: number,
  body: UpdateExpenseDto,
  api: ApiClient = defaultApi,
): Promise<ExpenseDto> {
  const { data, error, response } = await api.PATCH('/trips/{tripId}/expenses/{id}', {
    params: { path: { tripId, id: expenseId } },
    body,
  });
  if (error || !data) throw new ExpenseMutationError(response.status, error);
  return data;
}

export async function deleteExpense(
  tripId: number,
  expenseId: number,
  api: ApiClient = defaultApi,
): Promise<void> {
  const { error, response } = await api.DELETE('/trips/{tripId}/expenses/{id}', {
    params: { path: { tripId, id: expenseId } },
  });
  if (error || !response.ok) throw new ExpenseMutationError(response.status, error);
}

/** Expenses list (+ nested details), breakdown and budgets all derive from the expense set. */
export function invalidateTripMoney(queryClient: QueryClient, tripId: number): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.trips.expenses(tripId) }),
    queryClient.invalidateQueries({ queryKey: keys.trips.breakdown(tripId) }),
    queryClient.invalidateQueries({ queryKey: keys.trips.budgets(tripId) }),
  ]);
}

export function useCreateExpense(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateExpenseDto) => createExpense(tripId, body, api),
    onSuccess: () => invalidateTripMoney(queryClient, tripId),
  });
}

export function useUpdateExpense(tripId: number, expenseId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateExpenseDto) => updateExpense(tripId, expenseId, body, api),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.trips.expenseDetail(tripId, expenseId), data);
      return invalidateTripMoney(queryClient, tripId);
    },
  });
}

export function useDeleteExpense(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: number) => deleteExpense(tripId, expenseId, api),
    onSuccess: (_data, expenseId) => {
      queryClient.removeQueries({ queryKey: keys.trips.expenseDetail(tripId, expenseId) });
      return invalidateTripMoney(queryClient, tripId);
    },
  });
}

/** User-facing message for any thrown mutation error. */
export function expenseErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ExpenseMutationError) return err.classified.message || fallback;
  return classifyError(err).message || fallback;
}
