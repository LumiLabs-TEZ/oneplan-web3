import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { api, type ApiClient } from '@/api/client';
import { useAuthStore } from '@/auth/authStore';
import { registerSignOutHook } from '@/auth/signOutHooks';
import { currentLanguage, useAppLanguage } from '@/i18n';
import { storage } from '@/offline/mmkv';
import type { AppLanguage } from '@/stores/settingsStore';

import { registerBackgroundNotificationTask } from './backgroundTask';

/**
 * Device push-token lifecycle (port of PushTokenService.swift + PushTokenSync.kt).
 * The token value is never logged — an error object may embed the request body.
 */

export const PUSH_LAST_TOKEN_KEY = 'push.lastToken';
export const PUSH_LAST_LOCALE_KEY = 'push.lastLocale';

export type PushPlatform = 'ios' | 'android';
export type EngagementLocale = 'EN' | 'VN';

export interface PushStorage {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
}

export interface PushRegistrationDeps {
  api: Pick<ApiClient, 'POST' | 'DELETE'>;
  storage: PushStorage;
  isDevice: boolean;
  getPermissions: () => Promise<{ status: string }>;
  requestPermissions: () => Promise<{ status: string }>;
  registerBackgroundTask: () => Promise<boolean>;
  getToken: () => Promise<string>;
  platform: PushPlatform;
  language: () => AppLanguage;
  /** Bypass the last-token/locale dedupe (spike check, manual re-sync). */
  force?: boolean;
}

export type RegisterPushResult =
  'registered' | 'unchanged' | 'not-device' | 'permission-denied' | 'failed';

const defaultDeps = (): PushRegistrationDeps => ({
  api,
  storage,
  isDevice: Device.isDevice,
  getPermissions: () => Notifications.getPermissionsAsync(),
  requestPermissions: () => Notifications.requestPermissionsAsync(),
  registerBackgroundTask: registerBackgroundNotificationTask,
  getToken: async () => String((await Notifications.getDevicePushTokenAsync()).data),
  platform: Platform.OS === 'android' ? 'android' : 'ios',
  language: currentLanguage,
});

/** Engagement-copy locale persisted server-side (`EngagementLocale`). */
export function engagementLocale(language: AppLanguage): EngagementLocale {
  return language === 'vi' ? 'VN' : 'EN';
}

let inFlight: Promise<RegisterPushResult> | null = null;

/**
 * Register this device's push token with the server if it (or the app
 * language) changed since the last successful upload. Concurrent calls share
 * one run. Safe to call often (app foreground, auth, language change).
 */
export function registerPushToken(
  overrides: Partial<PushRegistrationDeps> = {},
): Promise<RegisterPushResult> {
  if (inFlight) return inFlight;
  const run = doRegister({ ...defaultDeps(), ...overrides }).finally(() => {
    inFlight = null;
  });
  inFlight = run;
  return run;
}

async function doRegister(deps: PushRegistrationDeps): Promise<RegisterPushResult> {
  if (!deps.isDevice) return 'not-device';

  try {
    let { status } = await deps.getPermissions();
    if (status === 'undetermined') ({ status } = await deps.requestPermissions());
    if (status !== 'granted') return 'permission-denied';

    await deps.registerBackgroundTask();

    const token = await deps.getToken();
    if (!token) return 'failed';
    const locale = engagementLocale(deps.language());

    if (
      !deps.force &&
      deps.storage.getString(PUSH_LAST_TOKEN_KEY) === token &&
      deps.storage.getString(PUSH_LAST_LOCALE_KEY) === locale
    ) {
      return 'unchanged';
    }

    const { response } = await deps.api.POST('/devices/token', {
      body: { token, platform: deps.platform, locale },
    });
    if (!response.ok) return 'failed';

    deps.storage.set(PUSH_LAST_TOKEN_KEY, token);
    deps.storage.set(PUSH_LAST_LOCALE_KEY, locale);
    return 'registered';
  } catch {
    return 'failed';
  }
}

/**
 * Best-effort `DELETE /devices/token` for the last uploaded token, then forget
 * it. Call while the session is still valid (before tokens are cleared) —
 * the endpoint is authenticated.
 */
export async function unregisterPushToken(
  overrides: Partial<Pick<PushRegistrationDeps, 'api' | 'storage' | 'platform'>> = {},
): Promise<void> {
  const deps = { ...defaultDeps(), ...overrides };
  const token = deps.storage.getString(PUSH_LAST_TOKEN_KEY);
  if (token) {
    try {
      await deps.api.DELETE('/devices/token', { body: { token, platform: deps.platform } });
    } catch {
      // best-effort: the server prunes dead tokens on delivery failure
    }
  }
  deps.storage.remove(PUSH_LAST_TOKEN_KEY);
  deps.storage.remove(PUSH_LAST_LOCALE_KEY);
}

/**
 * Re-sync the token whenever the user is signed in, the app returns to the
 * foreground, or the app language changes (locale is stored server-side).
 */
export function usePushRegistration(): void {
  const status = useAuthStore((s) => s.status);
  const language = useAppLanguage();

  useEffect(() => {
    if (status !== 'authed') return;
    const sync = () => void registerPushToken({ language: () => language });
    sync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, [status, language]);
}

let signOutHookInstalled = false;

/** Unregister the device token as part of sign-out (iOS never did — Android `PushTokenSync` does). */
export function installPushSignOutHook(): void {
  if (signOutHookInstalled) return;
  signOutHookInstalled = true;
  registerSignOutHook(() => unregisterPushToken());
}
