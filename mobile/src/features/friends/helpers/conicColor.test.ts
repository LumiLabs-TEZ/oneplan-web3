import { conicColor, RING_GRADIENT_STOPS } from './conicColor';

describe('conicColor', () => {
  it('returns each stop colour at its location', () => {
    for (const stop of RING_GRADIENT_STOPS.slice(1)) {
      expect(conicColor(-65 + stop.location * 360)).toBe(stop.color);
    }
  });

  it('clamps to the first stop before its location', () => {
    expect(conicColor(-65)).toBe('#6B7DFF');
    expect(conicColor(-60)).toBe('#6B7DFF');
  });

  it('interpolates between stops', () => {
    // Halfway between #F05EA8 (0.55) and #FF9614 (0.8).
    expect(conicColor(-65 + 0.675 * 360)).toBe('#F87A5E');
  });

  it('wraps angles outside one turn', () => {
    expect(conicColor(100)).toBe(conicColor(100 + 720));
    expect(conicColor(100)).toBe(conicColor(100 - 360));
  });
});
