/**
 * Saves a rendered image to the photo library — port of `PhotoDownloadService.saveImage`
 * (`PHPhotoLibrary.requestAuthorization(for: .addOnly)` + `PHAssetChangeRequest`).
 * `MediaLibrary.requestPermissionsAsync` (node_modules/expo-media-library/build/index.d.ts) takes
 * a `writeOnly` boolean, mirroring the iOS `.addOnly` scope.
 */
import * as MediaLibrary from 'expo-media-library';

export type SavePhotoResult = 'saved' | 'denied' | 'failed';

export async function saveImageToPhotos(uri: string): Promise<SavePhotoResult> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return 'denied';

  try {
    await MediaLibrary.saveToLibraryAsync(uri);
    return 'saved';
  } catch {
    return 'failed';
  }
}
