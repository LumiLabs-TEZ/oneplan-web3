import { useMutation, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { api as defaultApi, type ApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';
import { invalidateTripMoney } from '@/features/expense/api/mutations';

type ReceiptBody = components['schemas']['CreateReceiptExpenseDto'];

/** File implements Blob for Expo fetch; leave Content-Type unset for the multipart boundary. */
export function receiptFormData(uri: string): FormData {
  const form = new FormData();
  form.append('image', new File(uri), 'receipt.jpg');
  return form;
}

export async function scanReceipt(tripId: number, form: FormData, api: ApiClient = defaultApi) {
  try {
    const { data, error, response } = await api.POST('/trips/{tripId}/receipts/scan', {
      params: { path: { tripId } },
      // The generated binary schema is a string. The serializer supplies the actual multipart body.
      body: { image: 'receipt.jpg' },
      bodySerializer: () => form,
    });
    if (error || !data) throw new ApiMutationError(response.status, error);
    return data;
  } catch (error) {
    if (error instanceof ApiMutationError) throw error;
    throw new ApiMutationError(0, error);
  }
}

export async function createReceiptExpense(
  tripId: number,
  body: ReceiptBody,
  api: ApiClient = defaultApi,
) {
  try {
    const { data, error, response } = await api.POST('/trips/{tripId}/expenses/receipt', {
      params: { path: { tripId } },
      body,
    });
    if (error || !data) throw new ApiMutationError(response.status, error);
    return data;
  } catch (error) {
    if (error instanceof ApiMutationError) throw error;
    throw new ApiMutationError(0, error);
  }
}

export function useScanReceipt(tripId: number) {
  return useMutation({
    mutationFn: (uri: string) => scanReceipt(tripId, receiptFormData(uri)),
    retry: false,
    networkMode: 'always',
  });
}
export function useCreateReceiptExpense(tripId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ReceiptBody) => createReceiptExpense(tripId, body),
    retry: false,
    networkMode: 'always',
    onSuccess: () => invalidateTripMoney(client, tripId),
  });
}
