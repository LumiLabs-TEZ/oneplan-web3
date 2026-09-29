import { useMemo, useState } from 'react';
import {
  PixelRatio,
  Platform,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  NumericText as NativeNumericText,
  type NumericTextFormat,
} from 'react-native-numeric-text';

export type NumericFormat = {
  minimumIntegerDigits?: number;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
};

export type NumericTextProps = NumericFormat & {
  value: number;
  style?: StyleProp<TextStyle>;
  /** Plain text drawn before / after the number (symbol, `+`, `%`, `/12`). */
  prefix?: string;
  suffix?: string;
  prefixStyle?: StyleProp<TextStyle>;
  suffixStyle?: StyleProp<TextStyle>;
  /** Second colour for the decimal separator and fraction digits. */
  fractionColor?: ColorValue;
  /** Shrink the font (down to this factor) when the line doesn't fit, like `adjustsFontSizeToFit`. */
  minimumFontScale?: number;
  /** Layout of the row (margins, alignSelf, flexShrink); typography belongs in `style`. */
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
  /**
   * `false` draws one plain `<Text>` (no native view, no ghost, no layout pass) for numbers that
   * never change in place — list rows. Same string, digits and fraction colour; no transition.
   */
  animated?: boolean;
};

/** Every number renders en-US, matching `lib/currency.ts` grouping. */
const LOCALE = 'en-US';

/**
 * The string the native view draws, reproduced for layout and the accessibility label:
 * en-US separators, rounding half away from zero (the library's rule on every platform).
 * Hand-rolled rather than `Intl` for the same reason as `lib/currency.ts` — Hermes' partial
 * ICU must not change the output.
 */
export function formatNumeric(value: number, format: NumericFormat = {}): string {
  if (!Number.isFinite(value)) return '0';
  const minFraction = format.minimumFractionDigits ?? 0;
  const maxFraction = Math.max(format.maximumFractionDigits ?? 0, minFraction);
  const scale = 10 ** maxFraction;
  const scaled = Math.round(Math.abs(value) * scale);
  const negative = value < 0 && scaled !== 0;
  const whole = Math.floor(scaled / scale);
  let fraction = String(scaled - whole * scale).padStart(maxFraction, '0');
  while (fraction.length > minFraction && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  let digits = String(whole).padStart(format.minimumIntegerDigits ?? 1, '0');
  if (format.useGrouping ?? true) digits = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${digits}${fraction ? `.${fraction}` : ''}`;
}

/**
 * The bundled faces are one family per weight (`BeVietnamPro-SemiBold`). SwiftUI applies
 * `fontWeight` on top of the named face, and its default (regular) would pull the family back
 * to the regular cut, so the weight is derived from the face name.
 */
const FACE_WEIGHTS: [RegExp, TextStyle['fontWeight']][] = [
  [/-Thin/, '100'],
  [/-ExtraLight/, '200'],
  [/-Light/, '300'],
  [/-Medium/, '500'],
  [/-SemiBold/, '600'],
  [/-ExtraBold/, '800'],
  [/-Bold/, '700'],
  [/-Black/, '900'],
];
export function faceWeight(style: TextStyle): TextStyle['fontWeight'] {
  if (style.fontWeight !== undefined) return style.fontWeight;
  const face = style.fontFamily ?? '';
  return FACE_WEIGHTS.find(([pattern]) => pattern.test(face))?.[1] ?? '400';
}

/**
 * A number that animates between values with the platform's numeric-text transition
 * (SwiftUI `.contentTransition(.numericText())` on iOS, a native replica on Android).
 *
 * The native view has no intrinsic size — the library reserves an estimated box with room for
 * the transition's overspill, which would shift layout next to regular text. So the row is sized
 * by an invisible `<Text>` holding the same string in the same style (identical metrics to a plain
 * `<Text>`), and the native view is overlaid on it without taking part in layout. Affixes are
 * sibling `<Text>`s because the native view can't nest inside a `<Text>`; the whole row is one
 * accessibility element.
 */
export function NumericText({
  value,
  style,
  prefix,
  suffix,
  prefixStyle,
  suffixStyle,
  minimumIntegerDigits,
  minimumFractionDigits,
  maximumFractionDigits,
  useGrouping,
  fractionColor,
  minimumFontScale,
  containerStyle,
  accessibilityLabel,
  testID,
  animated = true,
}: NumericTextProps) {
  const format = useMemo<NumericTextFormat>(
    () => ({
      minimumIntegerDigits,
      minimumFractionDigits: minimumFractionDigits ?? 0,
      maximumFractionDigits: Math.max(maximumFractionDigits ?? 0, minimumFractionDigits ?? 0),
      useGrouping: useGrouping ?? true,
    }),
    [minimumIntegerDigits, minimumFractionDigits, maximumFractionDigits, useGrouping],
  );
  const [height, setHeight] = useState(0);
  const [fit, setFit] = useState({ available: 0, natural: 0 });
  const { layout, text } = splitStyle(style);
  const baseSize = text.fontSize ?? 14;
  const scale =
    minimumFontScale && fit.available > 0 && fit.natural > fit.available
      ? Math.max(minimumFontScale, fit.available / fit.natural)
      : 1;
  const flat: TextStyle = scale === 1 ? text : { ...text, fontSize: baseSize * scale };
  const fontSize = flat.fontSize ?? 14;
  // The native renderer ignores tracking and text shadows, so the sizing text drops them too;
  // on iOS a layer shadow on the overlay stands in for the text shadow.
  const {
    letterSpacing: _tracking,
    textAlign,
    textShadowColor,
    textShadowOffset,
    textShadowRadius,
    ...ghostStyle
  } = flat;
  const shadow: ViewStyle | null =
    textShadowColor && Platform.OS === 'ios'
      ? {
          shadowColor: textShadowColor,
          shadowOffset: textShadowOffset ?? { width: 0, height: 0 },
          shadowRadius: textShadowRadius ?? 0,
          shadowOpacity: 1,
        }
      : null;
  // Android draws with tabular digits and insets the line by a blur headroom of
  // `0.36 × line height + 4px` (NumericTextView.kt `hHeadroom`); iOS draws flush and proportional.
  const android = Platform.OS === 'android';
  const inset = android ? height * 0.36 + 4 / PixelRatio.get() : 0;
  const formatted = formatNumeric(value, format);
  // The library's box is 1.5× the font size tall with the glyphs centred; centre it on the line.
  const boxHeight = Math.ceil(fontSize * 1.5);
  const justifyContent = JUSTIFY[textAlign ?? 'auto'];
  const affixStyle = (own: StyleProp<TextStyle>) =>
    scale === 1
      ? [flat, own]
      : [flat, own, { fontSize: (StyleSheet.flatten(own)?.fontSize ?? baseSize) * scale }];
  const label = accessibilityLabel ?? `${prefix ?? ''}${formatted}${suffix ?? ''}`;

  if (!animated) {
    // The digits match what the native view would draw: no tracking (it ignores
    // `letterSpacing`) and tabular figures on Android; affixes keep the full style.
    const point = formatted.indexOf('.');
    return (
      <Text
        accessibilityRole="text"
        accessibilityLabel={label}
        testID={testID}
        style={[style, containerStyle as StyleProp<TextStyle>]}
        numberOfLines={1}
        adjustsFontSizeToFit={minimumFontScale != null}
        minimumFontScale={minimumFontScale}
      >
        {prefix ? <Text style={prefixStyle}>{prefix}</Text> : null}
        <Text style={[text.letterSpacing != null && styles.untracked, android && styles.tabular]}>
          {point < 0 || fractionColor == null ? (
            formatted
          ) : (
            <>
              {formatted.slice(0, point)}
              <Text style={{ color: fractionColor }}>{formatted.slice(point)}</Text>
            </>
          )}
        </Text>
        {suffix ? <Text style={suffixStyle}>{suffix}</Text> : null}
      </Text>
    );
  }

  const row = (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      testID={testID}
      style={[
        styles.row,
        !minimumFontScale && layout,
        { justifyContent },
        !minimumFontScale && containerStyle,
      ]}
    >
      {prefix ? <Text style={affixStyle(prefixStyle)}>{prefix}</Text> : null}
      <View>
        <Text
          style={[ghostStyle, android && styles.tabular, styles.ghost]}
          numberOfLines={1}
          onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        >
          {formatted}
        </Text>
        <View
          pointerEvents="none"
          style={[
            styles.overlay,
            shadow,
            { top: (height - boxHeight) / 2, left: -inset, opacity: height > 0 ? 1 : 0 },
          ]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <NativeNumericText
            value={value}
            locale={LOCALE}
            format={format}
            fractionColor={fractionColor}
            style={{
              fontSize,
              fontFamily: nativeFamily(flat.fontFamily),
              fontWeight: faceWeight(flat),
              color: flat.color,
              textAlign: 'left',
            }}
          />
        </View>
      </View>
      {suffix ? <Text style={affixStyle(suffixStyle)}>{suffix}</Text> : null}
    </View>
  );
  if (!minimumFontScale) return row;
  // Shrink-to-fit (`adjustsFontSizeToFit` for a view): the outer box takes the width the parent
  // offers, a hidden unconstrained copy at the base size measures what the line wants.
  return (
    <View
      style={[layout, containerStyle, { alignItems: ALIGN[justifyContent] }]}
      onLayout={(event) => {
        const available = event.nativeEvent.layout.width;
        setFit((current) =>
          current.available === available ? current : { ...current, available },
        );
      }}
    >
      {row}
      <View
        style={styles.measureHost}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <View
          style={styles.measureRow}
          onLayout={(event) => {
            const natural = event.nativeEvent.layout.width;
            setFit((current) => (current.natural === natural ? current : { ...current, natural }));
          }}
        >
          {prefix ? <Text style={[text, prefixStyle]}>{prefix}</Text> : null}
          <Text style={[ghostStyle, { fontSize: baseSize }, android && styles.tabular]}>
            {formatted}
          </Text>
          {suffix ? <Text style={[text, suffixStyle]}>{suffix}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/** `'System'` means the platform font in RN; the library spells that opt-out `'system'`. */
function nativeFamily(family: string | undefined): string | undefined {
  return family?.toLowerCase() === 'system' ? 'system' : family;
}

const ALIGN = {
  'flex-start': 'flex-start',
  center: 'center',
  'flex-end': 'flex-end',
} as const;

const JUSTIFY = {
  auto: 'flex-start',
  left: 'flex-start',
  justify: 'flex-start',
  center: 'center',
  right: 'flex-end',
} as const satisfies Record<NonNullable<TextStyle['textAlign']>, ViewStyle['justifyContent']>;

/** Box props that a call site put on its `<Text>` style belong to the row, not to each glyph run. */
const LAYOUT_KEYS = new Set<string>([
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
  'alignSelf',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'position',
  'top',
  'bottom',
  'left',
  'right',
  'zIndex',
  'minWidth',
  'maxWidth',
  'width',
  'opacity',
  'transform',
  'height',
  'minHeight',
  'maxHeight',
  // Badge decoration drawn by the `<Text>` box itself.
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingHorizontal',
  'paddingVertical',
  'paddingStart',
  'paddingEnd',
  'backgroundColor',
  'borderRadius',
  'borderWidth',
  'borderColor',
  'borderCurve',
  'overflow',
]);
function splitStyle(style: StyleProp<TextStyle>): { layout: ViewStyle; text: TextStyle } {
  const layout: Record<string, unknown> = {};
  const text: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(StyleSheet.flatten(style) ?? {})) {
    (LAYOUT_KEYS.has(key) ? layout : text)[key] = value;
  }
  return { layout: layout as ViewStyle, text: text as TextStyle };
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline' },
  ghost: { opacity: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  untracked: { letterSpacing: 0 },
  overlay: { position: 'absolute' },
  measureHost: { position: 'absolute', left: 0, top: 0, width: 100000, opacity: 0 },
  measureRow: { flexDirection: 'row', alignItems: 'baseline', alignSelf: 'flex-start' },
});
