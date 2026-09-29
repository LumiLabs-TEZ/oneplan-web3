import { morphFrame } from './morph';

describe('morphFrame (ExpandableGlassEffect math)', () => {
  it('is the plain pill when collapsed', () => {
    const f = morphFrame(0, 58, 172);
    expect(f).toMatchObject({ labelOpacity: 0, contentOpacity: 0, blurProgress: 0, height: 58 });
    expect(f.scaleX).toBe(1);
    expect(f.scaleY).toBe(1);
    expect(f.contentScale).toBeCloseTo(58 / 172);
  });

  it('is the full card when expanded', () => {
    const f = morphFrame(1, 58, 172);
    expect(f).toMatchObject({ labelOpacity: 1, contentOpacity: 1, contentScale: 1, height: 172 });
    expect(f.blurProgress).toBe(0);
  });

  it('squashes and lifts most at the midpoint', () => {
    const f = morphFrame(0.5, 58, 172);
    expect(f.blurProgress).toBe(1);
    expect(f.scaleX).toBe(0.5);
    expect(f.scaleY).toBe(1.35);
    expect(f.translateY).toBe(-10);
    // label is gone by 35%; content only starts fading in after 35%
    expect(f.labelOpacity).toBe(1);
    expect(f.contentOpacity).toBeCloseTo(0.15 / 0.65);
  });

  it('keeps the pill height until the content is measured', () => {
    expect(morphFrame(1, 58, 0).height).toBe(58);
  });
});
