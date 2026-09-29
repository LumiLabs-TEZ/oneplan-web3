/**
 * `MarketView.swift:391` `topBlurBackground` — a 435×455 `#33A3FF` circle, blurred 60, offset
 * y −310 behind the market content (visible through the glass toolbar). Approximated with a
 * radial gradient; the stop opacities are sampled from an `ImageRenderer` render of the real
 * SwiftUI blur, so the falloff matches the native glow (fade spans ~±120pt around the edge).
 * Other screens pass their own circle `radius` / `centerY`; the falloff keeps its width and
 * shifts with the edge.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

const COLOR = '#33A3FF';
/** Sampled blur(60) falloff: distance from center → alpha (the native circle has r 217.5). */
const FALLOFF: readonly [number, number][] = [
  [0, 1],
  [60, 0.984],
  [120, 0.886],
  [150, 0.773],
  [180, 0.608],
  [195, 0.5],
  [240, 0.235],
  [270, 0.11],
  [300, 0.04],
  [340, 0],
];
/** Radius the falloff was sampled at. */
const SAMPLED_RADIUS = 217.5;

export interface MarketTopGlowProps {
  /** Un-blurred circle radius. */
  radius?: number;
  /** Screen y of the circle's center; the MarketView circle sits at −82.5 (455 frame, offset −310). */
  centerY?: number;
}

export function MarketTopGlow({ radius = SAMPLED_RADIUS, centerY = -82.5 }: MarketTopGlowProps) {
  const shift = radius - SAMPLED_RADIUS;
  const falloff = FALLOFF.map(([distance, opacity], index) => [
    index === 0 ? 0 : Math.max(distance + shift, 1),
    opacity,
  ]) as [number, number][];
  /** Bounding box of the blurred disc. */
  const extent = falloff[falloff.length - 1]![0];
  const center = extent;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: centerY - extent }]}>
      <Svg width={2 * extent} height={2 * extent}>
        <Defs>
          <RadialGradient
            id="market-top-glow"
            cx={center}
            cy={center}
            r={extent}
            gradientUnits="userSpaceOnUse"
          >
            {falloff.map(([distance, opacity]) => (
              <Stop
                key={distance}
                offset={distance / extent}
                stopColor={COLOR}
                stopOpacity={opacity}
              />
            ))}
          </RadialGradient>
        </Defs>
        {/* The filled disc must cover the whole gradient — clipping it at the un-blurred radius
            leaves a visible 50%-alpha edge. */}
        <Circle cx={center} cy={center} r={extent} fill="url(#market-top-glow)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
