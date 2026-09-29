import { Image, type ImageProps } from 'expo-image';
import type { ReactNode } from 'react';

import { imageCacheKey } from '@/uploads/imageCacheKey';

export interface CachedImageProps extends Omit<ImageProps, 'source' | 'placeholder'> {
  uri?: string | null;
  /** Rendered instead of the image when `uri` is empty. */
  placeholder?: ReactNode;
}

/**
 * `expo-image` with a stable disk cache key (query string stripped) so presigned
 * URLs that change per request still hit the cache — iOS `TripImageCache` parity.
 */
export function CachedImage({
  uri,
  placeholder = null,
  contentFit = 'cover',
  transition = 150,
  ...rest
}: CachedImageProps) {
  if (!uri) return <>{placeholder}</>;
  const key = imageCacheKey(uri);
  return (
    <Image
      {...rest}
      source={{ uri, cacheKey: key }}
      cachePolicy="disk"
      recyclingKey={key}
      contentFit={contentFit}
      transition={transition}
    />
  );
}
