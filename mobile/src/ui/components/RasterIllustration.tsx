/**
 * Drop-in for Figma "SVGs" that are only a base64 PNG in a `<pattern>` fill. Through
 * react-native-svg those re-rasterize the full-resolution PNG in software on every native
 * (re)mount — and Fabric re-creates a tab's views each time it is shown (`display: none` on
 * the inactive scenes), which made Android tab switches drop ~250ms frames. The PNGs here are
 * the same SVGs rendered at @1x/@2x/@3x, drawn by `expo-image` (decoded bitmap cache).
 *
 * Keeps the `SvgProps` call shape (`width`/`height`/`preserveAspectRatio`/`style`/`testID`) so
 * call sites don't change.
 */
import { Image, type ImageProps } from 'expo-image';
import type { FC } from 'react';
import type { DimensionValue } from 'react-native';
import type { SvgProps } from 'react-native-svg';

function contentFit(preserveAspectRatio?: string): ImageProps['contentFit'] {
  if (preserveAspectRatio === 'none') return 'fill';
  return preserveAspectRatio?.includes('slice') ? 'cover' : 'contain';
}

export function rasterIllustration(
  source: number,
  intrinsic: { width: number; height: number },
): FC<SvgProps> {
  function RasterIllustration({ width, height, preserveAspectRatio, style, testID }: SvgProps) {
    return (
      <Image
        source={source}
        testID={testID}
        accessible={false}
        contentFit={contentFit(preserveAspectRatio)}
        transition={0}
        style={[
          {
            width: (width ?? intrinsic.width) as DimensionValue,
            height: (height ?? intrinsic.height) as DimensionValue,
          },
          style as ImageProps['style'],
        ]}
      />
    );
  }
  return RasterIllustration;
}
