/**
 * Uppercase caption laid out along a circle — substitute for the two iOS
 * `…CircularTextDrawingView` UIViews (`SendFriendRequestView.swift:588-700`), which draw the
 * glyphs one by one with Core Graphics and mask an `AngularGradient` with the result.
 *
 * Glyph placement uses `<TextPath>` on a circle `<Path>`; `textLength` stretches the run over
 * `TARGET_FILL` of the circumference (iOS fits its font size to the same arc), and the path
 * starts where iOS's first glyph sits so the seam lands at the bottom. react-native-svg has no
 * conic paint, so each glyph is tinted with the gradient colour under its centre (`conicColor`)
 * — the gradient rotates with the text on iOS, so a fixed per-glyph colour is equivalent.
 */
import { useId } from 'react';
import Svg, { Defs, Path, TSpan, Text, TextPath } from 'react-native-svg';

import { conicColor, RING_GRADIENT_STOPS } from '@/features/friends/helpers/conicColor';
import { BE_VIETNAM_PRO_FACES } from '@/ui/typography';

export interface CircularTextProps {
  /** Already-repeated phrase (see `ringText`). */
  text: string;
  /** Square canvas side. */
  size: number;
  /** Baseline circle radius, measured from the canvas centre. */
  radius: number;
  fontSize?: number;
  testID?: string;
}

/** The glyph run; each character is a child `<TSpan>` tagged `CIRCULAR_TEXT_GLYPH_TEST_ID`. */
export const CIRCULAR_TEXT_TEST_ID = 'circular-text-glyphs';
export const CIRCULAR_TEXT_GLYPH_TEST_ID = 'circular-text-glyph';

/** Gradient colours in sweep order (see `RING_GRADIENT_STOPS` for locations). */
export const RING_GRADIENT_COLORS = RING_GRADIENT_STOPS.map((s) => s.color);

/** iOS `targetFill`: share of the circumference the caption covers. */
const TARGET_FILL = 0.972;

export function CircularText({ text, size, radius, fontSize = 18, testID }: CircularTextProps) {
  const rawId = useId();
  const pathId = `ring-path-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const center = size / 2;
  const arcLength = 2 * Math.PI * radius * TARGET_FILL;
  // iOS `startAngle = -π/2 - totalArc / 2r`: the caption is centred on 12 o'clock.
  const start = -Math.PI / 2 - arcLength / (2 * radius);
  const x0 = center + radius * Math.cos(start);
  const y0 = center + radius * Math.sin(start);
  // Two clockwise half-circles from the start point back to itself.
  const d = `M ${x0} ${y0} A ${radius} ${radius} 0 1 1 ${2 * center - x0} ${2 * center - y0} A ${radius} ${radius} 0 1 1 ${x0} ${y0}`;

  const chars = Array.from(text.toUpperCase());
  const glyphColor = (index: number) => {
    const angle = start + (((index + 0.5) / chars.length) * arcLength) / radius;
    return conicColor((angle * 180) / Math.PI);
  };

  return (
    <Svg width={size} height={size} testID={testID}>
      <Defs>
        <Path id={pathId} d={d} />
      </Defs>
      <Text
        fontSize={fontSize}
        fontFamily={BE_VIETNAM_PRO_FACES.heavy}
        // react-native-svg drops to a regular face without an explicit weight.
        fontWeight="800"
        textLength={arcLength}
        lengthAdjust="spacing"
      >
        <TextPath href={`#${pathId}`} startOffset="0">
          <TSpan testID={CIRCULAR_TEXT_TEST_ID}>
            {chars.map((char, index) => (
              <TSpan key={index} fill={glyphColor(index)} testID={CIRCULAR_TEXT_GLYPH_TEST_ID}>
                {char}
              </TSpan>
            ))}
          </TSpan>
        </TextPath>
      </Text>
    </Svg>
  );
}
