/**
 * Friends read paths — friend list, incoming requests, and the two profile-preview screens
 * (`/friends/preview/{code}` for an unconnected code, `/friends/profile/{userId}` for an
 * already-known user, both ported from `FriendService`).
 */
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { useAuthStore } from '@/auth/authStore';
import { DEEP_LINK_CODE } from '@/links/parseUrl';

import type { FriendDto, FriendPreviewDto, FriendProfileDto, FriendRequestDto } from '../types';

/** Server-side friend codes are 64 lowercase hex characters. */
const FRIEND_CODE = /^[a-f0-9]{64}$/;

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function unwrap<T>(label: string, result: FetchResult<T>): T {
  const { data, error, response } = result;
  if (error !== undefined || !response.ok || data === undefined) {
    throw new Error(`${label} failed: ${response.status}`);
  }
  return data;
}

export async function fetchFriends(api: ApiClient = defaultApi): Promise<FriendDto[]> {
  return unwrap('GET /friends', await api.GET('/friends'));
}

/**
 * `enabled` on the auth store reporting `authed` — nothing to fetch signed out.
 * `refetchOnWindowFocus` re-checks on iOS `didBecomeActive` (foreground), mirroring
 * `useFriendRequests` below, so a friend added/removed elsewhere shows up without a manual pull.
 */
export function useFriends() {
  const authed = useAuthStore((s) => s.status === 'authed');
  return useQuery({
    queryKey: keys.friends.all,
    queryFn: () => fetchFriends(),
    enabled: authed,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export async function fetchFriendRequests(
  api: ApiClient = defaultApi,
): Promise<FriendRequestDto[]> {
  return unwrap('GET /friends/requests', await api.GET('/friends/requests'));
}

/**
 * `refetchOnWindowFocus` re-checks on iOS `didBecomeActive` (foreground) so a request accepted
 * while the app was backgrounded shows up without waiting for a realtime push.
 */
export function useFriendRequests() {
  const authed = useAuthStore((s) => s.status === 'authed');
  return useQuery({
    queryKey: keys.friends.requests,
    queryFn: () => fetchFriendRequests(),
    enabled: authed,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export async function fetchFriendPreview(
  friendCode: string,
  api: ApiClient = defaultApi,
): Promise<FriendPreviewDto> {
  return unwrap(
    `GET /friends/preview/${friendCode}`,
    await api.GET('/friends/preview/{friendCode}', { params: { path: { friendCode } } }),
  );
}

/**
 * Disabled for codes that fail the deep-link charset check or the server's 64-hex-char friend
 * code shape — a crafted link/QR must never reach the API.
 */
export function useFriendPreview(friendCode: string | undefined) {
  const code = friendCode ?? '';
  return useQuery({
    queryKey: keys.friends.preview(code),
    queryFn: () => fetchFriendPreview(code),
    enabled: DEEP_LINK_CODE.test(code) || FRIEND_CODE.test(code),
    staleTime: 0,
  });
}

export async function fetchFriendProfile(
  userId: number,
  api: ApiClient = defaultApi,
): Promise<FriendProfileDto> {
  return unwrap(
    `GET /friends/profile/${userId}`,
    await api.GET('/friends/profile/{userId}', { params: { path: { userId } } }),
  );
}

export function useFriendProfile(userId: number | undefined) {
  return useQuery({
    queryKey: keys.friends.profile(userId ?? 0),
    queryFn: () => fetchFriendProfile(userId as number),
    enabled: userId !== undefined,
    staleTime: 0,
  });
}

/** Friend list length — mirrors iOS `FriendService.friendCount`. */
export function friendCount(friends: FriendDto[]): number {
  return friends.length;
}

/** `"N mutual friends"` — pluralized via the `%lld mutual friends` i18n key. */
export function mutualLabel(count: number, t: TFunction): string {
  return t('%lld mutual friends', { count });
}
