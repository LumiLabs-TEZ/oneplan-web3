import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { readPreferences } from '@/native/legacySession';
import { zustandMMKVStorage } from '@/offline/mmkv';

/** Mirrors iOS `AppLanguage` (`en` | `vi`). Also sent as `Accept-Language`. */
export type AppLanguage = 'en' | 'vi';
export const APP_LANGUAGES: readonly AppLanguage[] = ['en', 'vi'];
export const SETTINGS_STORAGE_KEY = 'oneplan.settings';

export interface SettingsState {
  /** `null` = follow device locale (not yet chosen by the user). */
  language: AppLanguage | null;
  hasSeenOnboarding: boolean;
  /**
   * Persisted end of the limited-time free-trial promo window (`OnboardingManager.swift:19`
   * `trialOfferDeadline`). `null` until the promo is first shown; survives app relaunch so the
   * on-screen countdown doesn't reset on every open.
   */
  trialOfferDeadline: number | null;
  /** True only after the native preference read completed successfully. */
  nativePreferencesMigrated: boolean;
  setLanguage: (language: AppLanguage) => void;
  setHasSeenOnboarding: (seen: boolean) => void;
  setTrialOfferDeadline: (deadline: number | null) => void;
  setNativePreferencesMigrated: (migrated: boolean) => void;
}

type PersistedSettings = Partial<
  Pick<
    SettingsState,
    'language' | 'hasSeenOnboarding' | 'trialOfferDeadline' | 'nativePreferencesMigrated'
  >
>;

function readPersistedSettings(): PersistedSettings {
  const raw = zustandMMKVStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    // Zustand's JSON persist format is `{ state, version }`. Accept the flat shape too so
    // migrations remain compatible with an older hand-written settings entry.
    const state = (parsed as { state?: unknown }).state;
    return state && typeof state === 'object'
      ? (state as PersistedSettings)
      : (parsed as PersistedSettings);
  } catch {
    return {};
  }
}

function hasPersistedField(settings: PersistedSettings, field: keyof PersistedSettings): boolean {
  return Object.prototype.hasOwnProperty.call(settings, field);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: null,
      hasSeenOnboarding: false,
      trialOfferDeadline: null,
      nativePreferencesMigrated: false,
      setLanguage: (language) => set({ language }),
      setHasSeenOnboarding: (hasSeenOnboarding) => set({ hasSeenOnboarding }),
      setTrialOfferDeadline: (trialOfferDeadline) => set({ trialOfferDeadline }),
      setNativePreferencesMigrated: (nativePreferencesMigrated) =>
        set({ nativePreferencesMigrated }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => zustandMMKVStorage),
      partialize: (s) => ({
        language: s.language,
        hasSeenOnboarding: s.hasSeenOnboarding,
        trialOfferDeadline: s.trialOfferDeadline,
        nativePreferencesMigrated: s.nativePreferencesMigrated,
      }),
    },
  ),
);

/**
 * Imports the old native preferences without consulting authentication state. The persisted RN
 * object is inspected for field presence so an explicit `false` or `null` remains authoritative;
 * values are never replaced merely because they are defaults. The marker is written only after a
 * successful native bridge call, leaving unavailable storage retryable on a later launch.
 */
export async function migrateNativePreferences(): Promise<void> {
  const current = useSettingsStore.getState();
  if (current.nativePreferencesMigrated) return;

  const native = await readPreferences();
  const persisted = readPersistedSettings();
  const patch: Partial<SettingsState> = {};

  const onboardingAlreadySet =
    hasPersistedField(persisted, 'hasSeenOnboarding') || current.hasSeenOnboarding;
  if (!onboardingAlreadySet && typeof native.hasSeenOnboarding === 'boolean') {
    patch.hasSeenOnboarding = native.hasSeenOnboarding;
  }

  const deadlineAlreadySet =
    hasPersistedField(persisted, 'trialOfferDeadline') || current.trialOfferDeadline !== null;
  if (!deadlineAlreadySet && typeof native.trialOfferDeadline === 'number') {
    // Do not compare with Date.now(): expired deadlines are still valid persisted state.
    patch.trialOfferDeadline = native.trialOfferDeadline;
  }

  useSettingsStore.setState({
    ...patch,
    nativePreferencesMigrated: true,
  });
}
