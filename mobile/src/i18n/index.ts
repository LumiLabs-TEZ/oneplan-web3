import { getCalendars, getLocales } from 'expo-localization';
import i18n, { changeLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { type AppLanguage, APP_LANGUAGES, useSettingsStore } from '@/stores/settingsStore';

import en from './locales/en.json';
import vi from './locales/vi.json';

export const resources = {
  en: { translation: en },
  vi: { translation: vi },
} as const;

/** Device locale → supported app language (default `en`). */
export function detectDeviceLanguage(
  languageCodes: readonly (string | null)[] = deviceCodes(),
): AppLanguage {
  for (const code of languageCodes) {
    const lang = code?.toLowerCase().split(/[-_]/)[0];
    if (lang && (APP_LANGUAGES as readonly string[]).includes(lang)) return lang as AppLanguage;
  }
  return 'en';
}

function deviceCodes(): (string | null)[] {
  try {
    return getLocales().map((l) => l.languageCode);
  } catch {
    return [];
  }
}

/**
 * Locale for *display* formatting — iOS `Locale.current`: the app language plus the device
 * region, so an English UI on a UK/VN-region phone reads "6 Aug 2026", not "Aug 6, 2026".
 * Never use for wire formats.
 */
export function displayLocale(language: AppLanguage, region = deviceRegion()): string {
  return region ? `${language}-${region}` : language;
}

function deviceRegion(): string | null {
  try {
    return getLocales()[0]?.regionCode ?? null;
  } catch {
    return null;
  }
}

/** Device 12/24-hour preference; `undefined` lets `Intl` use the locale default. */
export function deviceUses24hourClock(): boolean | undefined {
  try {
    return getCalendars()[0]?.uses24hourClock ?? undefined;
  } catch {
    return undefined;
  }
}

/** Language the app is currently rendering in; the value for `Accept-Language`. */
export function currentLanguage(): AppLanguage {
  return useSettingsStore.getState().language ?? detectDeviceLanguage();
}

let initialized = false;

export function initI18n(): typeof i18n {
  if (initialized) return i18n;
  initialized = true;
  // eslint-disable-next-line import/no-named-as-default-member -- default instance API
  void i18n.use(initReactI18next).init({
    resources,
    lng: currentLanguage(),
    fallbackLng: 'en',
    // Keys are English source strings: they contain '.' and ':' so the
    // default key/namespace separators must be disabled.
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false, prefix: '{{', suffix: '}}' },
    returnNull: false,
  });
  // Keep i18next in sync when the user picks a language (no restart needed).
  useSettingsStore.subscribe((state, prev) => {
    if (state.language !== prev.language) {
      void changeLanguage(state.language ?? detectDeviceLanguage());
    }
  });
  return i18n;
}

/** Reactive variant for components (a plain `currentLanguage()` call gets memoized by the React Compiler). */
export function useAppLanguage(): AppLanguage {
  const chosen = useSettingsStore((s) => s.language);
  return chosen ?? detectDeviceLanguage();
}

/** User picks a language: persists + switches immediately. */
export function setAppLanguage(language: AppLanguage): void {
  useSettingsStore.getState().setLanguage(language);
}

export default i18n;
