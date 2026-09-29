import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

import { CachedImage } from './CachedImage';

export interface SFSymbolProps {
  /** SF Symbol name, rendered natively on iOS via Expo Image's `sf:/` source. */
  name: string;
  /** Ionicons glyph used on Android. */
  fallback: ComponentProps<typeof Ionicons>['name'];
  /** Glyph point size. */
  size: number;
  color: string;
  /** Frame side; defaults to `size`. */
  frame?: number;
  weight?: '400' | '500' | '600' | '700';
}

/** An SF Symbol on iOS with an Ionicons stand-in elsewhere (same approach as `ReceiptIcon`). */
export function SFSymbol({ name, fallback, size, color, frame = size, weight }: SFSymbolProps) {
  if (Platform.OS === 'ios') {
    return (
      <CachedImage
        uri={`sf:/${name}`}
        contentFit="contain"
        transition={0}
        style={{
          width: frame,
          height: frame,
          fontSize: size,
          fontWeight: weight,
          tintColor: color,
        }}
      />
    );
  }
  return <Ionicons name={fallback} size={size} color={color} />;
}
