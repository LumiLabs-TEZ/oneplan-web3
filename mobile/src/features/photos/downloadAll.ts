/**
 * "Download all" for the trip-end shared album — port of `PhotoDownloadService.swift`.
 *
 * Drains every photo page, asks for photo-library permission once, then downloads each photo
 * into the cache directory and hands the local file to the media library. A single photo
 * failing never aborts the run (iOS parity: the count reported back is what actually saved).
 *
 * Every dependency is injectable so the whole flow is testable without native modules
 * (`downloadAll.test.ts`); `defaultDeps` binds the real Expo SDK 57 APIs — note
 * `downloadAsync` now lives under `expo-file-system/legacy`.
 */
import { cacheDirectory, downloadAsync } from 'expo-file-system/legacy';
import { requestPermissionsAsync, saveToLibraryAsync } from 'expo-media-library';

import { fetchAllPhotos } from '@/features/trip/api/photos';

export type DownloadAllResult =
  | { status: 'success'; saved: number; total: number }
  | { status: 'permissionDenied' }
  | { status: 'failure'; message: string };

export interface DownloadablePhoto {
  id: number;
  url?: string | null;
}

export interface DownloadAllDeps {
  listPhotos: (tripId: number) => Promise<DownloadablePhoto[]>;
  requestPermission: () => Promise<{ granted: boolean }>;
  download: (url: string, fileUri: string) => Promise<{ uri: string }>;
  saveToLibrary: (fileUri: string) => Promise<void>;
  /** Directory local copies are written to; must end with a slash. */
  cacheDir: string;
  /** Called after every photo with the running `done`/`total` counts (drives the button label). */
  onProgress?: (done: number, total: number) => void;
}

export const defaultDeps: Omit<DownloadAllDeps, 'onProgress'> = {
  listPhotos: (tripId) => fetchAllPhotos(tripId),
  requestPermission: async () => {
    const res = await requestPermissionsAsync();
    return { granted: res.granted };
  },
  download: (url, fileUri) => downloadAsync(url, fileUri),
  saveToLibrary: (fileUri) => saveToLibraryAsync(fileUri),
  cacheDir: cacheDirectory ?? '',
};

/** Saves every photo of `tripId` to the camera roll. Never throws — failures come back as a result. */
export async function downloadAll(
  tripId: number,
  deps: Partial<DownloadAllDeps> = {},
): Promise<DownloadAllResult> {
  const { listPhotos, requestPermission, download, saveToLibrary, cacheDir, onProgress } = {
    ...defaultDeps,
    ...deps,
  };

  let photos: DownloadablePhoto[];
  try {
    photos = (await listPhotos(tripId)).filter((p) => Boolean(p.url));
  } catch (err) {
    return { status: 'failure', message: messageOf(err) };
  }

  if (photos.length === 0) return { status: 'success', saved: 0, total: 0 };

  try {
    const permission = await requestPermission();
    if (!permission.granted) return { status: 'permissionDenied' };
  } catch {
    return { status: 'permissionDenied' };
  }

  let saved = 0;
  let done = 0;
  for (const photo of photos) {
    try {
      const result = await download(photo.url as string, `${cacheDir}oneplan-${photo.id}.jpg`);
      await saveToLibrary(result.uri);
      saved += 1;
    } catch {
      // Skip this photo; a single bad URL must not abort the batch.
    }
    done += 1;
    onProgress?.(done, photos.length);
  }

  if (saved === 0) return { status: 'failure', message: 'download-failed' };
  return { status: 'success', saved, total: photos.length };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
