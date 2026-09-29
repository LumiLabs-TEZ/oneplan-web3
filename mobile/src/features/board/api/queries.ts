import { extractionRequest } from './timeout';
import { useQuery } from '@tanstack/react-query';
import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { useAuthStore } from '@/auth/authStore';
import { HttpError } from '@/features/trip/api/queries';

export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.data === undefined) {
    throw new HttpError('Board request', result.response.status, result.error);
  }
  return result.data;
}
export async function fetchBoards(api: ApiClient = defaultApi) {
  return unwrap(await api.GET('/board'));
}
export async function fetchBoard(boardId: number, api: ApiClient = defaultApi) {
  return unwrap(await api.GET('/board/{boardId}', { params: { path: { boardId } } }));
}
export async function fetchQuota(api: ApiClient = defaultApi) {
  return unwrap(await api.GET('/board/pins/extract/quota'));
}
export async function fetchActiveExtraction(api: ApiClient = defaultApi) {
  return extractionRequest(
    async (signal) =>
      unwrap(await api.GET('/board/pins/extract/active', { signal })).session ?? null,
  );
}
export async function fetchExtraction(sessionId: string, api: ApiClient = defaultApi) {
  return extractionRequest(async (signal) =>
    unwrap(
      await api.GET('/board/pins/extract/{sessionId}', { params: { path: { sessionId } }, signal }),
    ),
  );
}
export function useBoards() {
  const enabled = useAuthStore((s) => s.status === 'authed');
  return useQuery({
    queryKey: keys.board.all,
    queryFn: () => fetchBoards(),
    enabled,
    staleTime: 30_000,
  });
}
export function useBoard(id: number) {
  const authed = useAuthStore((s) => s.status === 'authed');
  return useQuery({
    queryKey: keys.board.detail(id),
    queryFn: () => fetchBoard(id),
    enabled: authed && Number.isSafeInteger(id) && id > 0,
  });
}
export function useScanCredits(options: { enabled?: boolean; transport?: ApiClient } = {}) {
  const authed = useAuthStore((s) => s.status === 'authed');
  return useQuery({
    queryKey: keys.scanCredits.balance,
    queryFn: () => fetchQuota(options.transport),
    enabled: authed && options.enabled !== false,
    staleTime: 15_000,
  });
}
