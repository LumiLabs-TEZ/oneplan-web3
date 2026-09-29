/**
 * Friend request + friendship mutations. Every mutation invalidates `friends.all` and
 * `friends.requests` (plus the specific preview/profile key it touched) so the friends list,
 * the incoming-requests badge, and any open preview/profile screen stay in sync.
 */
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import type { FriendDto, FriendRequestDto } from '../types';

export async function sendFriendRequest(
  friendCode: string,
  api: ApiClient = defaultApi,
): Promise<void> {
  const { error, response } = await api.POST('/friends/request', {
    body: { friendCode },
  });
  if (error || !response.ok) throw new ApiMutationError(response.status, error);
}

export async function cancelSentFriendRequest(
  friendCode: string,
  api: ApiClient = defaultApi,
): Promise<void> {
  const { error, response } = await api.DELETE('/friends/request/{friendCode}', {
    params: { path: { friendCode } },
  });
  if (error || !response.ok) throw new ApiMutationError(response.status, error);
}

export async function respondToFriendRequest(
  id: number,
  accept: boolean,
  api: ApiClient = defaultApi,
): Promise<void> {
  const { error, response } = await api.PATCH('/friends/request/{id}/respond', {
    params: { path: { id } },
    body: { accept },
  });
  if (error || !response.ok) throw new ApiMutationError(response.status, error);
}

export async function unfriend(friendshipId: number, api: ApiClient = defaultApi): Promise<void> {
  const { error, response } = await api.DELETE('/friends/{friendshipId}', {
    params: { path: { friendshipId } },
  });
  if (error || !response.ok) throw new ApiMutationError(response.status, error);
}

function invalidateFriendLists(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.friends.all }),
    queryClient.invalidateQueries({ queryKey: keys.friends.requests }),
  ]);
}

export function useSendFriendRequest(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (friendCode: string) => sendFriendRequest(friendCode, api),
    onSuccess: (_data, friendCode) =>
      Promise.all([
        invalidateFriendLists(queryClient),
        queryClient.invalidateQueries({ queryKey: keys.friends.preview(friendCode) }),
      ]),
  });
}

export function useCancelFriendRequest(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (friendCode: string) => cancelSentFriendRequest(friendCode, api),
    onSuccess: (_data, friendCode) =>
      Promise.all([
        invalidateFriendLists(queryClient),
        queryClient.invalidateQueries({ queryKey: keys.friends.preview(friendCode) }),
      ]),
  });
}

/**
 * Removes the request from the `friends.requests` cache immediately (it's resolved either way);
 * accepting also invalidates `friends.all` so the new friend shows up in the list.
 */
export function useRespondFriendRequest(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: number; accept: boolean }) =>
      respondToFriendRequest(id, accept, api),
    onSuccess: (_data, { id, accept }) => {
      queryClient.setQueryData<FriendRequestDto[]>(keys.friends.requests, (prev) =>
        prev ? prev.filter((r) => r.id !== id) : prev,
      );
      return accept
        ? invalidateFriendLists(queryClient)
        : queryClient.invalidateQueries({ queryKey: keys.friends.requests });
    },
  });
}

/**
 * Home-banner decline: optimistically drops the request from `friends.requests` so the banner
 * animates out at once; restores it if the PATCH fails. The server marks it `DECLINED`, so the
 * next fetch (or relaunch) never returns it again.
 */
export function useDeclineFriendRequest(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => respondToFriendRequest(id, false, api),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: keys.friends.requests });
      const previous = queryClient.getQueryData<FriendRequestDto[]>(keys.friends.requests);
      queryClient.setQueryData<FriendRequestDto[]>(keys.friends.requests, (prev) =>
        prev ? prev.filter((r) => r.id !== id) : prev,
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.friends.requests, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.friends.requests }),
  });
}

/** Optimistically removes the friend from `friends.all`; restores it if the delete fails. */
export function useUnfriend(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (friendshipId: number) => unfriend(friendshipId, api),
    onMutate: async (friendshipId: number) => {
      await queryClient.cancelQueries({ queryKey: keys.friends.all });
      const previous = queryClient.getQueryData<FriendDto[]>(keys.friends.all);
      queryClient.setQueryData<FriendDto[]>(keys.friends.all, (prev) =>
        prev ? prev.filter((f) => f.friendshipId !== friendshipId) : prev,
      );
      return { previous };
    },
    onError: (_err, _friendshipId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.friends.all, context.previous);
      }
    },
    onSettled: () => invalidateFriendLists(queryClient),
  });
}
