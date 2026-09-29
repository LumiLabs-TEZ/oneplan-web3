import { applyLanguageChange } from './applyLanguageChange';

describe('applyLanguageChange', () => {
  it('applies the local language and syncs the server locale while online', () => {
    const setAppLanguage = jest.fn();
    const syncLocale = jest.fn();

    applyLanguageChange('vi', { setAppLanguage, isOnline: () => true, syncLocale });

    expect(setAppLanguage).toHaveBeenCalledWith('vi');
    expect(syncLocale).toHaveBeenCalledWith('VN');
  });

  it('maps "en" to the "EN" server locale', () => {
    const setAppLanguage = jest.fn();
    const syncLocale = jest.fn();

    applyLanguageChange('en', { setAppLanguage, isOnline: () => true, syncLocale });

    expect(syncLocale).toHaveBeenCalledWith('EN');
  });

  it('still applies the local language offline, but skips the server sync silently', () => {
    const setAppLanguage = jest.fn();
    const syncLocale = jest.fn();

    applyLanguageChange('vi', { setAppLanguage, isOnline: () => false, syncLocale });

    expect(setAppLanguage).toHaveBeenCalledWith('vi');
    expect(syncLocale).not.toHaveBeenCalled();
  });
});
