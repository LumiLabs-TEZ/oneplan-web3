import i18n, { currentLanguage, detectDeviceLanguage, initI18n, setAppLanguage } from './index';
import en from './locales/en.json';
import vi from './locales/vi.json';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'vi' }] }));

describe('generated resources', () => {
  it('covers the 1039 catalog keys (+ plural expansions) in both locales', () => {
    const enKeys = Object.keys(en);
    expect(enKeys.length).toBeGreaterThanOrEqual(1039);
    expect(Object.keys(vi).sort()).toEqual(enKeys.sort());
  });

  it('has no leftover printf placeholders', () => {
    const leftovers = Object.values({ ...en, ...vi }).filter((v) => /%(\d+\$)?(l{0,2}d|@)/.test(v));
    expect(leftovers).toEqual([]);
  });
});

describe('language detection', () => {
  it('maps device locales to a supported language', () => {
    expect(detectDeviceLanguage(['vi-VN'])).toBe('vi');
    expect(detectDeviceLanguage(['fr-FR', 'en-US'])).toBe('en');
    expect(detectDeviceLanguage(['ja'])).toBe('en');
    expect(detectDeviceLanguage([null])).toBe('en');
  });
});

describe('runtime', () => {
  beforeAll(() => {
    initI18n();
  });

  it('starts in the device language when none chosen', () => {
    expect(currentLanguage()).toBe('vi');
    expect(i18n.t('Home')).toBe((vi as Record<string, string>)['Home']);
  });

  it('switches without restart and interpolates indexed args + count', () => {
    setAppLanguage('en');
    expect(i18n.language).toBe('en');
    expect(currentLanguage()).toBe('en');
    expect(i18n.t('%lld days', { count: 1 })).toBe('1 day');
    expect(i18n.t('%lld days', { count: 3 })).toBe('3 days');
    expect(i18n.t('%@ · Day %lld', { 0: 'Da Lat', 1: 2 })).toBe('Da Lat · Day 2');
    setAppLanguage('vi');
    expect(i18n.t('%lld days', { count: 3 })).toBe('3 ngày');
  });
});
