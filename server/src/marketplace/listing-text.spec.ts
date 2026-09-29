import {
  availableLocales,
  pickItemText,
  pickListingText,
} from './listing-text';

const listing = {
  name: 'Đà Lạt 3N2Đ',
  description: 'Mô tả',
  sourceLocale: 'vi' as const,
  translations: [
    { locale: 'en' as const, name: 'Da Lat 3D2N', description: null },
  ],
};

describe('pickListingText', () => {
  it('serves base text when locale is null or equals the source locale', () => {
    expect(pickListingText(listing, null)).toEqual({
      name: 'Đà Lạt 3N2Đ',
      description: 'Mô tả',
    });
    expect(pickListingText(listing, 'vi')).toEqual({
      name: 'Đà Lạt 3N2Đ',
      description: 'Mô tả',
    });
  });

  it('uses the translation with per-field fallback to base', () => {
    expect(pickListingText(listing, 'en')).toEqual({
      name: 'Da Lat 3D2N',
      description: 'Mô tả',
    });
  });

  it('falls back to base when no translation row exists', () => {
    expect(pickListingText({ ...listing, translations: [] }, 'en').name).toBe(
      'Đà Lạt 3N2Đ',
    );
    expect(
      pickListingText({ ...listing, translations: undefined }, 'en').name,
    ).toBe('Đà Lạt 3N2Đ');
  });
});

describe('pickItemText', () => {
  it('translates item text only for a non-source locale with a row', () => {
    const item = {
      title: 'Cà phê',
      description: 'x',
      translations: [
        { locale: 'en' as const, title: 'Coffee', description: 'y' },
      ],
    };
    expect(pickItemText(item, 'vi', 'en')).toEqual({
      title: 'Coffee',
      description: 'y',
    });
    expect(pickItemText(item, 'vi', 'vi')).toEqual({
      title: 'Cà phê',
      description: 'x',
    });
    expect(pickItemText(item, 'vi', null)).toEqual({
      title: 'Cà phê',
      description: 'x',
    });
  });
});

describe('availableLocales', () => {
  it('lists the source locale plus every translation, deduplicated', () => {
    expect(availableLocales(listing)).toEqual(['vi', 'en']);
    expect(availableLocales({ sourceLocale: 'en' })).toEqual(['en']);
  });
});
