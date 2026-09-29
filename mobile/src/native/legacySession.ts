import { requireNativeModule } from 'expo';

export interface LegacySession {
  accessToken: string;
  refreshToken: string;
  appleUserId?: string;
}

/** Preferences owned by the previous native clients and migrated into RN settings once. */
export interface LegacyPreferences {
  hasSeenOnboarding?: boolean;
  /** Unix epoch milliseconds, matching the RN settings store. */
  trialOfferDeadline?: number;
}

/** Called only when no RN session (including its signed-out tombstone) exists. */
export async function readLegacySession(): Promise<LegacySession | null> {
  const module = requireNativeModule<{ read(): Promise<LegacySession | null> }>('LegacySession');
  return module.read();
}

/**
 * Reads native preferences independently of the legacy token store. A successful empty object is
 * meaningful (there is nothing to migrate); a rejected bridge call is intentionally allowed to
 * reach the caller so the migration marker remains unset and the next launch can retry.
 */
export async function readPreferences(): Promise<LegacyPreferences> {
  const module = requireNativeModule<{
    readPreferences(): Promise<LegacyPreferences | null>;
  }>('LegacySession');
  const result = await module.readPreferences();
  if (result === null || typeof result !== 'object') {
    throw new Error('Native preferences unavailable');
  }
  const preferences: LegacyPreferences = {};
  if (typeof result.hasSeenOnboarding === 'boolean') {
    preferences.hasSeenOnboarding = result.hasSeenOnboarding;
  }
  if (
    typeof result.trialOfferDeadline === 'number' &&
    Number.isFinite(result.trialOfferDeadline)
  ) {
    preferences.trialOfferDeadline = result.trialOfferDeadline;
  }
  return preferences;
}
