/**
 * `ExpandableGlassEffect.swift` math for the JS tab bar: one `progress` (0 collapsed → 1
 * expanded) drives the squash, lift, cross-fade and card growth.
 */

/**
 * `.bouncy(duration: 0.5, extraBounce: 0.05)` ⇒ SwiftUI spring(duration 0.5, bounce 0.35):
 * stiffness = (2π / 0.5)², damping = 4π(1 − 0.35) / 0.5 (mass 1).
 */
export const MORPH_SPRING = { mass: 1, stiffness: 157.9, damping: 16.34 } as const;

/** Where the ported card anchors (`MorphingTabBar` passes `alignment: .center`). */
const CENTER_OFFSET = -10;

export interface MorphFrame {
  labelOpacity: number;
  contentOpacity: number;
  contentScale: number;
  /** 0 at both ends, 1 mid-morph — drives blur, squash and lift. */
  blurProgress: number;
  scaleX: number;
  scaleY: number;
  translateY: number;
  height: number;
}

export function morphFrame(
  progress: number,
  labelHeight: number,
  contentHeight: number,
): MorphFrame {
  'worklet';
  const labelOpacity = Math.min(progress / 0.35, 1);
  const contentOpacity = Math.max(progress - 0.35, 0) / 0.65;
  // Width never changes (the rows fill the bar), so the aspect scale is height-bound.
  const minAspectScale = contentHeight > 0 ? Math.min(1, labelHeight / contentHeight) : 1;
  const contentScale = minAspectScale + (1 - minAspectScale) * progress;
  const blurProgress = progress > 0.5 ? (1 - progress) / 0.5 : progress / 0.5;
  const heightDiff = contentHeight > 0 ? contentHeight - labelHeight : 0;
  return {
    labelOpacity,
    contentOpacity,
    contentScale,
    blurProgress,
    scaleX: 1 - blurProgress * 0.5,
    scaleY: 1 + blurProgress * 0.35,
    translateY: CENTER_OFFSET * blurProgress,
    height: labelHeight + heightDiff * contentOpacity,
  };
}
