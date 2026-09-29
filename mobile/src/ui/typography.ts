import type { TextStyle } from 'react-native';

/**
 * Port of Extension/Font+BeVietnamPro.swift. iOS maps a `Font.Weight` to a
 * discrete named face instead of using `.weight()`; RN needs the same because
 * custom TTFs register one `fontFamily` per face.
 */
export type FontWeightName =
  'thin' | 'ultraLight' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';

export const BE_VIETNAM_PRO_FACES: Record<FontWeightName, string> = {
  thin: 'BeVietnamPro-Thin',
  ultraLight: 'BeVietnamPro-ExtraLight',
  light: 'BeVietnamPro-Light',
  regular: 'BeVietnamPro-Regular',
  medium: 'BeVietnamPro-Medium',
  semibold: 'BeVietnamPro-SemiBold',
  bold: 'BeVietnamPro-Bold',
  heavy: 'BeVietnamPro-ExtraBold',
  black: 'BeVietnamPro-Black',
};

export const INSTRUMENT_SERIF = {
  regular: 'InstrumentSerif-Regular',
  italic: 'InstrumentSerif-Italic',
} as const;

/** Every face bundled via the expo-font config plugin (postscript names). */
export const ALL_FONT_FACES: readonly string[] = [
  ...Object.values(BE_VIETNAM_PRO_FACES),
  'BeVietnamPro-ThinItalic',
  'BeVietnamPro-ExtraLightItalic',
  'BeVietnamPro-LightItalic',
  'BeVietnamPro-Italic',
  'BeVietnamPro-MediumItalic',
  'BeVietnamPro-SemiBoldItalic',
  'BeVietnamPro-BoldItalic',
  'BeVietnamPro-ExtraBoldItalic',
  'BeVietnamPro-BlackItalic',
  INSTRUMENT_SERIF.regular,
  INSTRUMENT_SERIF.italic,
];

/** `.beVietnamPro(size, weight:)` equivalent. Spread into a Text style. */
export function beVietnamPro(
  size: number,
  weight: FontWeightName = 'regular',
): Pick<TextStyle, 'fontFamily' | 'fontSize'> {
  return { fontFamily: BE_VIETNAM_PRO_FACES[weight], fontSize: size };
}

export function instrumentSerif(
  size: number,
  italic = false,
): Pick<TextStyle, 'fontFamily' | 'fontSize'> {
  return {
    fontFamily: italic ? INSTRUMENT_SERIF.italic : INSTRUMENT_SERIF.regular,
    fontSize: size,
  };
}
