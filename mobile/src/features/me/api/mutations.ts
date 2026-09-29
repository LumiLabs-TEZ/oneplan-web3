/**
 * Profile mutations — `PATCH /auth/me` (display name / currency / locale / engagement push
 * consent) and avatar upload. Both refresh `keys.me` so the profile screen and any card reading
 * `useMe()` pick up the change immediately.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';
import { uploadImage as defaultUploadImage } from '@/uploads/uploadService';

import type { UserProfileDto } from '../useMe';

export type UpdateProfileDto = components['schemas']['UpdateProfileDto'];

export async function updateProfile(
  body: UpdateProfileDto,
  api: ApiClient = defaultApi,
): Promise<UserProfileDto> {
  // `updateProfile`'s spec only declares the 200 response, so openapi-fetch types `data` as
  // always present — widen before the runtime failure check so the error branch still
  // type-checks (mirrors `trip/api/mutations.ts#createTrip`).
  const { data, error, response } = (await api.PATCH('/auth/me', { body })) as {
    data?: UserProfileDto;
    error?: unknown;
    response: Response;
  };
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export function useUpdateProfile(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileDto) => updateProfile(body, api),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.me, data);
      return queryClient.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export interface UploadAvatarDeps {
  uploadImage?: typeof defaultUploadImage;
}

/**
 * Presigned-upload of a new avatar (`target: 'user-avatar'`, `entityId: userId`) — same flow as
 * trip cover/photo uploads (`uploadService.ts`). Invalidates `keys.me` so the new `avatarUrl`
 * shows up without a manual refetch.
 */
export async function uploadAvatar(
  uri: string,
  userId: number,
  deps: UploadAvatarDeps = {},
): Promise<void> {
  const uploadImage = deps.uploadImage ?? defaultUploadImage;
  await uploadImage({ uri, target: 'user-avatar', entityId: userId });
}

export function useUploadAvatar(userId: number, deps: UploadAvatarDeps = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uri: string) => uploadAvatar(uri, userId, deps),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  });
}
