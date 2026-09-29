/**
 * Photo-library picker(s) — replaces the ad-hoc permission + launch calls duplicated across
 * screens (`trip/new/index.tsx`, `HomeCard` cover picker). Mirrors the iOS `PhotosPicker` flow:
 * request permission, launch the picker, return `null`/`[]` on denial or cancel.
 */
import * as ImagePicker from 'expo-image-picker';

/** Resolves to the picked asset's local `uri`, or `null` when permission is denied or the user cancels. */
export async function pickImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets || !result.assets[0]) return null;

  return result.assets[0].uri;
}

/** Resolves to the picked assets' local `uri`s (up to `limit`), or `[]` when denied or canceled. */
export async function pickImages(limit: number): Promise<string[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
  });
  if (result.canceled || !result.assets) return [];

  return result.assets.map((asset) => asset.uri);
}
