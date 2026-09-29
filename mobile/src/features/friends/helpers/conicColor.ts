/**
 * Colour of an iOS `AngularGradient` at a given angle — the friend-request badges mask a conic
 * gradient with the ring caption (`ReceiveFriendRequestView.swift` `FriendRequestAvatarBadge`),
 * and react-native-svg has no conic paint, so `CircularText` tints each glyph with the colour
 * under its centre instead.
 *
 * Angles follow SwiftUI: degrees, 0° at 3 o'clock, clockwise positive (screen y points down).
 */

export interface ConicStop {
  color: string;
  location: number;
}

/** `AngularGradient` stops from both badges, in sweep order. */
export const RING_GRADIENT_STOPS: readonly ConicStop[] = [
  { color: '#6B7DFF', location: 0.03 },
  { color: '#8057ED', location: 0.29 },
  { color: '#F05EA8', location: 0.55 },
  { color: '#FF9614', location: 0.8 },
  { color: '#6B7DFF', location: 1 },
];

/** `startAngle: .degrees(-65)` — the sweep spans a full turn from here. */
export const RING_GRADIENT_START_DEG = -65;

function parseHex(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((c) => Math.round(c).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** Colour at `angleDeg`; before the first / after the last stop it clamps, like SwiftUI. */
export function conicColor(
  angleDeg: number,
  stops: readonly ConicStop[] = RING_GRADIENT_STOPS,
  startDeg: number = RING_GRADIENT_START_DEG,
): string {
  const t = ((((angleDeg - startDeg) % 360) + 360) % 360) / 360;
  const first = stops[0]!;
  if (t <= first.location) return first.color;
  for (let i = 1; i < stops.length; i++) {
    const hi = stops[i]!;
    if (t <= hi.location) {
      const lo = stops[i - 1]!;
      const f = (t - lo.location) / (hi.location - lo.location);
      const a = parseHex(lo.color);
      const b = parseHex(hi.color);
      return toHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
    }
  }
  return stops[stops.length - 1]!.color;
}
