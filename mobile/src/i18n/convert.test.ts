import { convertInfoPlist, convertPlaceholders, convertXcstrings, type Xcstrings } from './convert';

const unit = (value: string) => ({ stringUnit: { state: 'translated', value } });

describe('convertPlaceholders', () => {
  it.each([
    ['%@ · Day %lld', '{{0}} · Day {{1}}'],
    ['%lld friends (%lld mutuals)', '{{0}} friends ({{1}} mutuals)'],
    ['-%1$@%2$@ (you owe)', '-{{0}}{{1}} (you owe)'],
    ['%2$@ then %1$@', '{{1}} then {{0}}'],
    ['%@, %2$lld', '{{0}}, {{1}}'],
    ['%.1f km', '{{0}} km'],
    ['100%%', '100%'],
    ['plain', 'plain'],
  ])('%s → %s', (input, expected) => {
    expect(convertPlaceholders(input)).toBe(expected);
  });

  it('maps the first integer placeholder to {{count}} in plural mode', () => {
    expect(convertPlaceholders('%@, %lld pins, %@', { plural: true })).toBe(
      '{{0}}, {{count}} pins, {{2}}',
    );
    expect(convertPlaceholders('%lld days', { plural: true })).toBe('{{count}} days');
  });
});

describe('convertXcstrings', () => {
  const catalog: Xcstrings = {
    sourceLanguage: 'en',
    strings: {
      Hello: { localizations: { en: unit('Hello'), vi: unit('Xin chào') } },
      'Trip to %@': { localizations: { en: unit('Trip to %@'), vi: unit('Chuyến đi %@') } },
      'Only English': { localizations: { en: unit('Only English') } },
      '0': {},
      '%@ (%@)': { localizations: { en: unit('%1$@ (%2$@)'), vi: unit('%2$@ - %1$@') } },
      'Bad %@': { localizations: { en: unit('Bad %@'), vi: unit('Tệ') } },
      '%lld days': {
        localizations: {
          en: { variations: { plural: { one: unit('%lld day'), other: unit('%lld days') } } },
          vi: { variations: { plural: { other: unit('%lld ngày') } } },
        },
      },
    },
  };
  const { resources, report } = convertXcstrings(catalog, ['en', 'vi']);

  it('uses the source string as key', () => {
    expect(resources.en!.Hello).toBe('Hello');
    expect(resources.vi!.Hello).toBe('Xin chào');
  });

  it('converts placeholders in both locales', () => {
    expect(resources.en!['Trip to %@']).toBe('Trip to {{0}}');
    expect(resources.vi!['Trip to %@']).toBe('Chuyến đi {{0}}');
  });

  it('falls back to English for missing vi and reports it', () => {
    expect(resources.vi!['Only English']).toBe('Only English');
    expect(report.missing.vi).toContain('Only English');
    expect(report.missing.en).toEqual([]);
  });

  it('emits keys without localizations verbatim', () => {
    expect(resources.en!['0']).toBe('0');
    expect(resources.vi!['0']).toBe('0');
  });

  it('honours positional reordering', () => {
    expect(resources.en!['%@ (%@)']).toBe('{{0}} ({{1}})');
    expect(resources.vi!['%@ (%@)']).toBe('{{1}} - {{0}}');
    expect(report.placeholderMismatch.find((m) => m.key === '%@ (%@)')).toBeUndefined();
  });

  it('reports placeholder drift', () => {
    expect(report.placeholderMismatch).toEqual([
      { key: 'Bad %@', locale: 'vi', en: 'Bad %@', other: 'Tệ' },
    ]);
  });

  it('expands plurals to _one/_other with {{count}}', () => {
    expect(resources.en!['%lld days_one']).toBe('{{count}} day');
    expect(resources.en!['%lld days_other']).toBe('{{count}} days');
    expect(resources.vi!['%lld days_other']).toBe('{{count}} ngày');
    // vi has no `one` (Vietnamese has no grammatical plural) — falls back to vi's own `other`,
    // not the English `one`, so a vi user never sees untranslated source text.
    expect(resources.vi!['%lld days_one']).toBe('{{count}} ngày');
    expect(resources.en!['%lld days']).toBeUndefined();
    expect(report.plurals).toBe(1);
  });

  it('counts', () => {
    expect(report.total).toBe(7);
  });
});

describe('convertInfoPlist', () => {
  it('flattens per locale with English fallback', () => {
    const out = convertInfoPlist(
      {
        sourceLanguage: 'en',
        strings: {
          NSCameraUsageDescription: { localizations: { en: unit('Camera'), vi: unit('Máy ảnh') } },
          CFBundleDisplayName: { localizations: { en: unit('OnePlan Travel') } },
        },
      },
      ['en', 'vi'],
    );
    expect(out.vi).toEqual({
      NSCameraUsageDescription: 'Máy ảnh',
      CFBundleDisplayName: 'OnePlan Travel',
    });
  });
});
