import { extractionRequest } from './timeout';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api as defaultApi, type ApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';
import { keys } from '@/api/keys';
import type {
  CreateBoard,
  UpdateBoard,
  PinInput,
  GenerateTrip,
  GenerateDescription,
} from '../types';

export function mutationResult<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.data === undefined)
    throw new ApiMutationError(result.response.status, result.error);
  return result.data;
}
export async function createBoard(body: CreateBoard, api: ApiClient = defaultApi) {
  return mutationResult(await api.POST('/board', { body }));
}
export async function updateBoard(boardId: number, body: UpdateBoard, api: ApiClient = defaultApi) {
  return mutationResult(
    await api.PATCH('/board/{boardId}', { params: { path: { boardId } }, body }),
  );
}
export async function deleteBoard(boardId: number, api: ApiClient = defaultApi) {
  const result = await api.DELETE('/board/{boardId}', { params: { path: { boardId } } });
  if (!result.response.ok) throw new ApiMutationError(result.response.status, result.error);
}
export async function deletePin(boardId: number, pinId: number, api: ApiClient = defaultApi) {
  const result = await api.DELETE('/board/{boardId}/pins/{pinId}', {
    params: { path: { boardId, pinId } },
  });
  if (!result.response.ok) throw new ApiMutationError(result.response.status, result.error);
}
export async function addPins(boardId: number, pins: PinInput[], api: ApiClient = defaultApi) {
  return mutationResult(
    await api.POST('/board/{boardId}/pins', { params: { path: { boardId } }, body: { pins } }),
  );
}
export async function generateDescription(body: GenerateDescription, api: ApiClient = defaultApi) {
  return mutationResult(await api.POST('/board/generate-description', { body })).description;
}
export async function generateTrip(
  boardId: number,
  body: GenerateTrip,
  api: ApiClient = defaultApi,
) {
  return mutationResult(
    await api.POST('/board/{boardId}/generate-trip', { params: { path: { boardId } }, body }),
  );
}
export async function startExtraction(sourceUrl: string, api: ApiClient = defaultApi) {
  return extractionRequest(
    async (signal) =>
      mutationResult(await api.POST('/board/pins/extract', { body: { sourceUrl }, signal }))
        .sessionId,
  );
}
export async function cancelExtraction(sessionId: string, api: ApiClient = defaultApi) {
  const result = await api.DELETE('/board/pins/extract/{sessionId}', {
    params: { path: { sessionId } },
  });
  if (!result.response.ok) throw new ApiMutationError(result.response.status, result.error);
}
export function useBoardMutation<T, V>(mutationFn: (variables: V) => Promise<T>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.board.all }),
  });
}
