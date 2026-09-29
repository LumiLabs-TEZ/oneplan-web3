/**
 * Stable cache key for a remote image URL.
 *
 * Presigned/signed download URLs vary by query token (and occasionally a
 * fragment) while pointing at the same object, so the key is the URL with
 * both stripped — mirrors iOS `Services/TripImageCache.swift` (`components.query = nil`).
 */
export function imageCacheKey(uri: string): string {
  // Expo's development server puts the bundled asset path in this query parameter.
  // Stripping it aliases every local fixture image to the same /assets/ cache entry.
  if (uri.includes('/assets/?unstable_path=')) return uri.split('#')[0]!;
  const cut = firstIndexOf(uri, ['?', '#']);
  return cut === -1 ? uri : uri.slice(0, cut);
}

function firstIndexOf(value: string, needles: readonly string[]): number {
  let result = -1;
  for (const needle of needles) {
    const idx = value.indexOf(needle);
    if (idx !== -1 && (result === -1 || idx < result)) result = idx;
  }
  return result;
}
