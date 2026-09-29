/**
 * Port of `Services/StorageUploadService.swift:1-93` — presigned-upload flow: compress → presign
 * → PUT to S3 → confirm. `HomeCard` (trip cover) and `trip/new` (create-trip cover) call
 * `uploadImage` fire-and-forget; callers own retry/error UX. `uploadAudio` (M2.2) shares the same
 * presign/PUT/confirm shape for plan-item voice notes, skipping the compression step.
 */
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

import { type ApiClient, api as defaultApi } from '@/api/client';
import type { components } from '@/api/schema';

export type UploadTarget = components['schemas']['PresignUploadDto']['target'];
export type UploadResultDto = components['schemas']['UploadResultDto'];

export interface UploadImageArgs {
  uri: string;
  target: UploadTarget;
  entityId: number;
  caption?: string;
  onProgress?: (p: number) => void;
}

export type UploadErrorCode =
  'compressionFailed' | 'invalidPresignedUrl' | 's3UploadFailed' | 'confirmFailed';

export class UploadError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode) {
    super(code);
    this.name = 'UploadError';
    this.code = code;
  }
}

const MAX_DIMENSION = 2048;

/**
 * Best-effort longest-side read via `Image.getSize` — cheap enough for a picker uri, but the
 * native call can reject for exotic uri schemes, so a failure just skips the resize step below
 * rather than failing the whole upload.
 */
async function longestSide(uri: string): Promise<number | null> {
  try {
    const { width, height } = await Image.getSize(uri);
    return Math.max(width, height);
  } catch {
    return null;
  }
}

/**
 * Resize (only when the longest side exceeds 2048px) + JPEG compress 0.85 —
 * `StorageUploadService.swift:37-40`. `expo-image-manipulator@57` still ships the deprecated
 * `manipulateAsync(uri, actions, saveOptions)` used here (the new `manipulate()` API needs a
 * separate `renderAsync` step); Jest mocks it as a passthrough (`jest.setup.ts`).
 */
export async function prepareJpeg(
  uri: string,
  manipulate: typeof ImageManipulator.manipulateAsync = ImageManipulator.manipulateAsync,
): Promise<{ uri: string }> {
  const side = await longestSide(uri);
  const actions =
    side !== null && side > MAX_DIMENSION ? [{ resize: { width: MAX_DIMENSION } }] : [];

  try {
    const result = await manipulate(uri, actions, {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: result.uri };
  } catch {
    throw new UploadError('compressionFailed');
  }
}

/**
 * Default PUT: `expo-file-system/legacy`'s native `uploadAsync` streams the prepared file from
 * disk and sends the `Content-Type` header verbatim. RN's global `fetch` with a `file://` Blob is
 * only a fallback: the Blob it builds has an empty `type`, and the Content-Type RN then sends does
 * not match the signed `image/jpeg`, so GCS v4 signed URLs answer 403 `SignatureDoesNotMatch`
 * (observed on the iOS simulator during the Phase 7 e2e upload-retry run).
 */
async function defaultPut(
  url: string,
  fileUri: string,
  contentType = 'image/jpeg',
): Promise<number> {
  try {
    const result = await uploadAsync(url, fileUri, {
      httpMethod: 'PUT',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': contentType },
    });
    return result.status;
  } catch {
    const body = await (await fetch(fileUri)).blob();
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body,
    });
    return response.status;
  }
}

export type PutFn = (url: string, fileUri: string, contentType?: string) => Promise<number>;

export interface UploadImageDeps {
  api?: ApiClient;
  put?: PutFn;
  prepare?: typeof prepareJpeg;
}

export async function uploadImage(
  args: UploadImageArgs,
  deps: UploadImageDeps = {},
): Promise<UploadResultDto> {
  const api = deps.api ?? defaultApi;
  const put = deps.put ?? defaultPut;
  const prepare = deps.prepare ?? prepareJpeg;
  const { uri, target, entityId, caption, onProgress } = args;

  const prepared = await prepare(uri);
  onProgress?.(0.1);

  const presignResult = await api.POST('/uploads/presign', {
    body: { target, entityId, contentType: 'image/jpeg' },
  });
  if (presignResult.error || !presignResult.data) throw new UploadError('invalidPresignedUrl');
  const presigned = presignResult.data;
  onProgress?.(0.2);

  const status = await put(presigned.uploadUrl, prepared.uri);
  if (status < 200 || status >= 300) throw new UploadError('s3UploadFailed');
  onProgress?.(0.8);

  const confirmResult = await api.POST('/uploads/confirm', {
    body: { target, entityId, objectKey: presigned.objectKey, caption },
  });
  if (confirmResult.error || !confirmResult.data) throw new UploadError('confirmFailed');
  onProgress?.(1);

  return confirmResult.data;
}

export interface UploadAudioArgs {
  uri: string;
  tripId: number;
  onProgress?: (p: number) => void;
}

export interface UploadAudioDeps {
  api?: ApiClient;
  put?: PutFn;
}

/**
 * Presigned upload for a plan-item voice note — same presign → PUT → confirm shape as
 * `uploadImage`, but no compression step (the file is already an M4A recording) and the server
 * only needs the object key back (it stores the key on the plan item, not the download URL).
 */
export async function uploadAudio(
  args: UploadAudioArgs,
  deps: UploadAudioDeps = {},
): Promise<{ objectKey: string }> {
  const api = deps.api ?? defaultApi;
  const put = deps.put ?? defaultPut;
  const { uri, tripId, onProgress } = args;

  const target: UploadTarget = 'plan-item-voice';
  const contentType = 'audio/mp4';

  const presignResult = await api.POST('/uploads/presign', {
    body: { target, entityId: tripId, contentType, filename: 'voice.m4a' },
  });
  if (presignResult.error || !presignResult.data) throw new UploadError('invalidPresignedUrl');
  const presigned = presignResult.data;
  onProgress?.(0.2);

  const status = await put(presigned.uploadUrl, uri, contentType);
  if (status < 200 || status >= 300) throw new UploadError('s3UploadFailed');
  onProgress?.(0.8);

  const confirmResult = await api.POST('/uploads/confirm', {
    body: { target, entityId: tripId, objectKey: presigned.objectKey },
  });
  if (confirmResult.error || !confirmResult.data) throw new UploadError('confirmFailed');
  onProgress?.(1);

  return { objectKey: confirmResult.data.objectKey };
}
