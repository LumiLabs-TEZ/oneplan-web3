import { ALL_FONT_FACES, BE_VIETNAM_PRO_FACES, beVietnamPro, instrumentSerif } from './typography';

describe('beVietnamPro weight → face map (Font+BeVietnamPro.swift)', () => {
  it.each([
    ['thin', 'BeVietnamPro-Thin'],
    ['ultraLight', 'BeVietnamPro-ExtraLight'],
    ['light', 'BeVietnamPro-Light'],
    ['regular', 'BeVietnamPro-Regular'],
    ['medium', 'BeVietnamPro-Medium'],
    ['semibold', 'BeVietnamPro-SemiBold'],
    ['bold', 'BeVietnamPro-Bold'],
    ['heavy', 'BeVietnamPro-ExtraBold'],
    ['black', 'BeVietnamPro-Black'],
  ] as const)('%s → %s', (weight, face) => {
    expect(beVietnamPro(14, weight)).toEqual({ fontFamily: face, fontSize: 14 });
  });

  it('defaults to regular', () => {
    expect(beVietnamPro(48).fontFamily).toBe(BE_VIETNAM_PRO_FACES.regular);
  });

  it('instrumentSerif picks italic face', () => {
    expect(instrumentSerif(20, true).fontFamily).toBe('InstrumentSerif-Italic');
  });

  it('bundles all 20 faces', () => {
    expect(new Set(ALL_FONT_FACES).size).toBe(20);
  });
});
