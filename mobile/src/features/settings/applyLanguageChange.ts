/**
 * Language-switch effect for the Settings screen — port of iOS `updateLocale`: the app-language
 * switch itself (AsyncStorage/i18next) is purely local and always applies, even offline. Only the
 * best-effort server `locale` sync is network-gated, and silently skipped (no alert, no error
 * surfaced) when offline — the server catches up on the next successful `PATCH /auth/me`.
 */
export interface ApplyLanguageChangeDeps {
  setAppLanguage: (lang: 'en' | 'vi') => void;
  isOnline: () => boolean;
  syncLocale: (locale: 'EN' | 'VN') => void;
}

export function applyLanguageChange(lang: 'en' | 'vi', deps: ApplyLanguageChangeDeps): void {
  deps.setAppLanguage(lang);
  if (!deps.isOnline()) return;
  deps.syncLocale(lang === 'vi' ? 'VN' : 'EN');
}
