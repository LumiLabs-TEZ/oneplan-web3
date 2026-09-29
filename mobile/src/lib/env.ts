import { Platform } from 'react-native';
import Constants from 'expo-constants';

export type AppVariant = 'local' | 'dev' | 'prod';

interface Extra {
  variant: AppVariant;
  apiUrl: string;
  linkHosts: string[];
  googleIosClientId: string;
  googleWebClientId: string;
  foursquareApiKey?: string;
  facebookAppId?: string;
  privyAppId?: string;
  privyClientId?: string;
  googleMapsAndroidConfigured?: boolean;
  googleMapsIosConfigured?: boolean;
  adUnits?: {
    ios: { rewarded: string; endTrip: string; market: string };
    android: { rewarded: string; endTrip: string; market: string };
  };
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

if (!extra.apiUrl || !extra.variant) {
  throw new Error('expo config `extra.apiUrl`/`extra.variant` missing — check app.config.ts');
}

const rawFoursquareApiKey = extra.foursquareApiKey;
const foursquareApiKey =
  rawFoursquareApiKey && rawFoursquareApiKey !== 'unset' ? rawFoursquareApiKey : null;

const rawFacebookAppId = extra.facebookAppId;
const facebookAppId = rawFacebookAppId && rawFacebookAppId !== 'unset' ? rawFacebookAppId : null;

const rawPrivyAppId = extra.privyAppId;
const privyAppId = rawPrivyAppId && rawPrivyAppId !== 'unset' ? rawPrivyAppId : null;

const rawPrivyClientId = extra.privyClientId;
const privyClientId =
  rawPrivyClientId && rawPrivyClientId !== 'unset' ? rawPrivyClientId : null;

interface Env {
  adUnits: { rewarded: string; endTrip: string; market: string };
  variant: AppVariant;
  apiUrl: string;
  linkHosts: string[];
  /**
   * Android application id, needed as `packageName` for `POST /subscription/play/verify` and for
   * `deepLinkToSubscriptions({ packageNameAndroid })`. `null` on iOS / when unset.
   */
  androidPackage: string | null;
  /** `null` when unset, empty, or the app.config.ts placeholder `'unset'`. */
  foursquareApiKey: string | null;
  /** `null` when unset, empty, or the app.config.ts placeholder `'unset'`. */
  facebookAppId: string | null;
  /**
   * Privy dashboard ids. `null` until the operator provisions a real Privy app — the wallet
   * provider then renders a "not configured" state instead of mounting the Privy SDK
   * (`WalletError.notConfigured`, mirrors `WalletService.swift`'s `privy = nil` branch).
   */
  privyAppId: string | null;
  privyClientId: string | null;
  /** Whether `GOOGLE_MAPS_ANDROID_API_KEY` was set at build time (Android MapView needs it). */
  googleMapsAndroidConfigured: boolean;
  /** Whether `GOOGLE_MAPS_IOS_API_KEY` was set at build time (iOS Google MapView needs it). */
  googleMapsIosConfigured: boolean;
  /** Public Google OAuth client ids baked in by app.config.ts (see auth/google.ts). */
  google: {
    /** Web client id — audience the server's `GOOGLE_CLIENT_ID` verifies. */
    webClientId: string;
    /** iOS client id (Info.plist `GIDClientID` in the iOS app). */
    iosClientId: string;
  };
}

/** The single source of environment values for app code. */
export const env: Readonly<Env> = Object.freeze({
  variant: extra.variant,
  apiUrl: extra.apiUrl.replace(/\/+$/, ''),
  linkHosts: extra.linkHosts ?? [],
  androidPackage: Constants.expoConfig?.android?.package ?? null,
  foursquareApiKey,
  facebookAppId,
  privyAppId,
  privyClientId,
  googleMapsAndroidConfigured: extra.googleMapsAndroidConfigured ?? false,
  googleMapsIosConfigured: extra.googleMapsIosConfigured ?? false,
  google: {
    webClientId: extra.googleWebClientId,
    iosClientId: extra.googleIosClientId,
  },
  adUnits: extra.adUnits?.[Platform.OS === 'ios' ? 'ios' : 'android'] ?? {
    rewarded: '',
    endTrip: '',
    market: '',
  },
});

export const isProd = env.variant === 'prod';

/** wss:// URL on the API host (mirrors APIClient.webSocketURL). */
export function webSocketUrl(path: string): string {
  return env.apiUrl.replace(/^http/, 'ws') + (path.startsWith('/') ? path : `/${path}`);
}
