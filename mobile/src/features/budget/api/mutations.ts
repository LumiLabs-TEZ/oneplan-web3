/**
 * Budget mutations — create/update/delete a trip budget, mark a payment paid/unpaid.
 * Budgets derive from + feed into the same trip-money picture as expenses, so every success
 * reuses `invalidateTripMoney` from the expense mutations module (expenses, breakdown, budgets).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';
import { invalidateTripMoney } from '@/features/expense/api/mutations';

type CreateBudgetDto = components['schemas']['CreateBudgetDto'];
type UpdateBudgetDto = components['schemas']['UpdateBudgetDto'];
type BudgetDto = components['schemas']['BudgetDto'];
type BudgetPaymentDto = components['schemas']['BudgetPaymentDto'];

export async function createBudget(
  tripId: number,
  body: CreateBudgetDto,
  api: ApiClient = defaultApi,
): Promise<BudgetDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/budgets', {
    params: { path: { tripId } },
    body,
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function updateBudget(
  tripId: number,
  budgetId: number,
  body: UpdateBudgetDto,
  api: ApiClient = defaultApi,
): Promise<BudgetDto> {
  const { data, error, response } = await api.PATCH('/trips/{tripId}/budgets/{id}', {
    params: { path: { tripId, id: budgetId } },
    body,
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function deleteBudget(
  tripId: number,
  budgetId: number,
  api: ApiClient = defaultApi,
): Promise<void> {
  const { error, response } = await api.DELETE('/trips/{tripId}/budgets/{id}', {
    params: { path: { tripId, id: budgetId } },
  });
  if (error || !response.ok) throw new ApiMutationError(response.status, error);
}

export async function markBudgetPayment(
  tripId: number,
  budgetId: number,
  paymentId: number,
  isPaid: boolean,
  api: ApiClient = defaultApi,
): Promise<BudgetPaymentDto> {
  const { data, error, response } = await api.PATCH(
    '/trips/{tripId}/budgets/{id}/payments/{paymentId}',
    {
      params: { path: { tripId, id: budgetId, paymentId } },
      body: { isPaid },
    },
  );
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export function useCreateBudget(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBudgetDto) => createBudget(tripId, body, api),
    onSuccess: () => invalidateTripMoney(queryClient, tripId),
  });
}

export function useUpdateBudget(tripId: number, budgetId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateBudgetDto) => updateBudget(tripId, budgetId, body, api),
    onSuccess: () => invalidateTripMoney(queryClient, tripId),
  });
}

export function useDeleteBudget(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (budgetId: number) => deleteBudget(tripId, budgetId, api),
    onSuccess: () => invalidateTripMoney(queryClient, tripId),
  });
}

export function useMarkPayment(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      budgetId,
      paymentId,
      isPaid,
    }: {
      budgetId: number;
      paymentId: number;
      isPaid: boolean;
    }) => markBudgetPayment(tripId, budgetId, paymentId, isPaid, api),
    onSuccess: () => invalidateTripMoney(queryClient, tripId),
  });
}
