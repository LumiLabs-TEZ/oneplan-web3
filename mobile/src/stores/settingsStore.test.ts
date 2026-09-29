import { readPreferences } from '@/native/legacySession';
import { storage } from '@/offline/mmkv';

import { migrateNativePreferences, SETTINGS_STORAGE_KEY, useSettingsStore } from './settingsStore';

const defaults = {
  language: null,
  hasSeenOnboarding: false,
  trialOfferDeadline: null,
  nativePreferencesMigrated: false,
};

beforeEach(() => {
  useSettingsStore.setState(defaults);
  storage.clearAll();
  jest.mocked(readPreferences).mockReset().mockResolvedValue({});
});

describe('migrateNativePreferences', () => {
  it('migrates onboarding and an active deadline without consulting auth state', async () => {
    jest.mocked(readPreferences).mockResolvedValue({
      hasSeenOnboarding: true,
      trialOfferDeadline: Date.now() + 3_600_000,
    });

    await migrateNativePreferences();

    expect(useSettingsStore.getState()).toMatchObject({
      hasSeenOnboarding: true,
      trialOfferDeadline: expect.any(Number),
      nativePreferencesMigrated: true,
    });
  });

  it('persists the migration marker with the imported settings', async () => {
    jest.mocked(readPreferences).mockResolvedValue({ hasSeenOnboarding: true });

    await migrateNativePreferences();

    const persisted = JSON.parse(storage.getString(SETTINGS_STORAGE_KEY)!);
    expect(persisted.state).toMatchObject({
      hasSeenOnboarding: true,
      nativePreferencesMigrated: true,
    });
  });

  it('preserves an expired native deadline instead of restarting the offer window', async () => {
    const expired = Date.now() - 1_000;
    jest.mocked(readPreferences).mockResolvedValue({ trialOfferDeadline: expired });

    await migrateNativePreferences();

    expect(useSettingsStore.getState().trialOfferDeadline).toBe(expired);
  });

  it('fills only missing fields and preserves existing React Native values, including false/null', async () => {
    storage.set(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        state: { hasSeenOnboarding: false, trialOfferDeadline: null },
        version: 0,
      }),
    );
    jest.mocked(readPreferences).mockResolvedValue({
      hasSeenOnboarding: true,
      trialOfferDeadline: Date.now() + 10_000,
    });

    await migrateNativePreferences();

    expect(useSettingsStore.getState()).toMatchObject({
      hasSeenOnboarding: false,
      trialOfferDeadline: null,
      nativePreferencesMigrated: true,
    });
  });

  it('marks an empty successful read complete while leaving missing values at their defaults', async () => {
    await migrateNativePreferences();

    expect(useSettingsStore.getState()).toMatchObject({
      hasSeenOnboarding: false,
      trialOfferDeadline: null,
      nativePreferencesMigrated: true,
    });
  });

  it('does not read native storage again on a repeated launch after migration', async () => {
    jest.mocked(readPreferences).mockResolvedValue({ hasSeenOnboarding: true });
    await migrateNativePreferences();
    await migrateNativePreferences();

    expect(readPreferences).toHaveBeenCalledTimes(1);
  });

  it('leaves the marker unset when native storage is unavailable so a later attempt retries', async () => {
    jest.mocked(readPreferences).mockRejectedValueOnce(new Error('native storage unavailable'));

    await expect(migrateNativePreferences()).rejects.toThrow('native storage unavailable');
    expect(useSettingsStore.getState().nativePreferencesMigrated).toBe(false);

    jest.mocked(readPreferences).mockResolvedValueOnce({ hasSeenOnboarding: true });
    await migrateNativePreferences();
    expect(useSettingsStore.getState()).toMatchObject({
      hasSeenOnboarding: true,
      nativePreferencesMigrated: true,
    });
  });
});
