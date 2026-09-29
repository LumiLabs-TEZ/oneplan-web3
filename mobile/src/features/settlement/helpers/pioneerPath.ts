/**
 * Silhouette of `PioneerAvatarShape` (`Component/Common/PioneerAvatar.swift`): a circle at 90.5%
 * of the half-side, rippled by three fixed sine waves so the outline stays rigid while it rotates.
 */
export const PIONEER_POINTS = 280;
export const PIONEER_BASE_RATIO = 0.905;

export function pioneerRadius(baseRadius: number, angle: number): number {
  const w1 = Math.sin(12 * angle + 0.35) * 0.055;
  const w2 = Math.sin(7 * angle + 1.4) * 0.018;
  const w3 = Math.sin(3 * angle - 0.8) * 0.012;
  return baseRadius * (1 + w1 + w2 + w3);
}

/** SVG `d` for a `size`×`size` box, centred. */
export function buildPioneerPath(size: number): string {
  const center = size / 2;
  const baseRadius = center * PIONEER_BASE_RATIO;
  const parts: string[] = [];
  for (let i = 0; i <= PIONEER_POINTS; i++) {
    const angle = (i / PIONEER_POINTS) * Math.PI * 2;
    const r = pioneerRadius(baseRadius, angle);
    const x = (center + r * Math.cos(angle)).toFixed(2);
    const y = (center + r * Math.sin(angle)).toFixed(2);
    parts.push(`${i === 0 ? 'M' : 'L'}${x} ${y}`);
  }
  parts.push('Z');
  return parts.join(' ');
}
