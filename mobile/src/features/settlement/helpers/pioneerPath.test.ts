import { buildPioneerPath, PIONEER_BASE_RATIO, PIONEER_POINTS, pioneerRadius } from './pioneerPath';

describe('buildPioneerPath', () => {
  it('emits one move, a line per remaining point, and closes', () => {
    const d = buildPioneerPath(140);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/L/g)).toHaveLength(PIONEER_POINTS);
  });

  it('keeps every point within the ripple amplitude of the base radius', () => {
    const size = 140;
    const base = (size / 2) * PIONEER_BASE_RATIO;
    const coords = [...buildPioneerPath(size).matchAll(/[ML]([\d.]+) ([\d.]+)/g)];
    for (const [, x, y] of coords) {
      const r = Math.hypot(Number(x) - size / 2, Number(y) - size / 2);
      expect(r).toBeGreaterThanOrEqual(base * (1 - 0.085) - 0.01);
      expect(r).toBeLessThanOrEqual(base * (1 + 0.085) + 0.01);
    }
  });

  it('matches the Swift wave formula at angle 0', () => {
    const expected =
      10 * (1 + Math.sin(0.35) * 0.055 + Math.sin(1.4) * 0.018 + Math.sin(-0.8) * 0.012);
    expect(pioneerRadius(10, 0)).toBeCloseTo(expected, 10);
  });
});
