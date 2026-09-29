import { withAndroidManifest } from 'expo/config-plugins';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import infoPlistEn from './src/i18n/infoplist/en.json';
import infoPlistVi from './src/i18n/infoplist/vi.json';
import skAdNetworkItems from './config/skadnetworks.json';

/**
 * Android 11+ package visibility: `react-native-share`'s `isPackageInstalled` /
 * `shareSingle` (Instagram Stories) need a `<queries>` entry for the Instagram
 * package, or `PackageManager` hides it regardless of installed apps. There is no
 * `android.queries` field on `ExpoConfig` (@expo/config-types ExpoConfig.d.ts has no
 * `queries` key under `Android`), so this is added via a small inline manifest mod
 * instead of a plugin config prop.
 */
function withInstagramPackageVisibility(config: ExpoConfig): ExpoConfig {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest as Record<string, unknown>;
    const queries = (manifest.queries as unknown[] | undefined) ?? [];
    queries.push({ package: [{ $: { 'android:name': 'com.instagram.android' } }] });
    manifest.queries = queries;
    return mod;
  });
}

/**
 * APP_VARIANT selects the environment at build time (mirrors the iOS
 * `#if DEBUG / DEV / release` bundle-id switch in APIClient.swift).
 *   local → local.lumilabs.oneplan / com.oneplan.android.local → devtunnel API
 *   dev   → dev.lumilabs.oneplan   / com.oneplan.android.dev   → dev-api.oneplan.space
 *   prod  → lumilabs.oneplan       / com.oneplan.android       → api.oneplan.space
 * App code must read these only through `src/lib/env.ts`.
 */
export type AppVariant = 'local' | 'dev' | 'prod';

const VARIANT = (process.env.APP_VARIANT ?? 'dev') as AppVariant;
if (!['local', 'dev', 'prod'].includes(VARIANT)) {
  throw new Error(`APP_VARIANT must be local|dev|prod, got "${VARIANT}"`);
}

const PER_VARIANT: Record<
  AppVariant,
  {
    name: string;
    iosBundleId: string;
    androidPackage: string;
    apiUrl: string;
    linkHosts: string[];
  }
> = {
  local: {
    name: 'OnePlan Local',
    iosBundleId: 'local.lumilabs.oneplan',
    androidPackage: 'com.oneplan.android.local',
    apiUrl: 'https://6x9884cw-3000.asse.devtunnels.ms',
    linkHosts: ['dev-api.oneplan.space', 'dev-op.oneplan.space'],
  },
  dev: {
    name: 'OnePlan Dev',
    iosBundleId: 'dev.lumilabs.oneplan',
    androidPackage: 'com.oneplan.android.dev',
    apiUrl: 'https://dev-api.oneplan.space',
    linkHosts: ['dev-api.oneplan.space', 'dev-op.oneplan.space'],
  },
  prod: {
    name: 'OnePlan Travel',
    iosBundleId: 'lumilabs.oneplan',
    androidPackage: 'com.oneplan.android',
    apiUrl: 'https://api.oneplan.space',
    linkHosts: ['api.oneplan.space', 'op.oneplan.space'],
  },
};

const v = PER_VARIANT[VARIANT];
// Optional override for `expo start` against a local server (e.g. API_URL=http://localhost:3000
// on the simulator; physical devices use the devtunnel/LAN address). Never set for EAS builds.
const apiUrl = process.env.API_URL ?? v.apiUrl;
if (VARIANT === 'prod' && apiUrl !== v.apiUrl) {
  throw new Error('Production builds must use the production API');
}

// Google Sign-In client ids (public values, from ios/OnePlan/OnePlan/Info.plist and
// eas.json). Defaults make local `expo start` work without a .env, matching the
// iOS app, which hardcodes its client id in AuthService.swift.
const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
  '559176877871-535pl0kskgdabrdg41h6nr03ira3vvmk.apps.googleusercontent.com';
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  '66936502756-llt4amv7b9fsjbit5gtu08snu0b9fjip.apps.googleusercontent.com';

// Google Sign-In reversed iOS client id (public value, from ios/OnePlan/OnePlan/Info.plist).
const GOOGLE_IOS_URL_SCHEME =
  process.env.GOOGLE_IOS_URL_SCHEME ??
  'com.googleusercontent.apps.559176877871-535pl0kskgdabrdg41h6nr03ira3vvmk';

// Firebase config (Android FCM) is not part of the public repo: set GOOGLE_SERVICES_JSON to a
// local google-services.json path to enable push; without it the file is simply omitted.
// Android only: FCM needs google-services.json. iOS push goes straight to APNs and
// Google Sign-In uses iosClientId, so no GoogleService-Info.plist is required.
const googleServicesJson = process.env.GOOGLE_SERVICES_JSON;

export default ({ config }: ConfigContext): ExpoConfig =>
  withInstagramPackageVisibility({
    ...config,
    name: v.name,
    slug: 'oneplan',
    owner: 'lumilabs',
    version: '2.0.0',
    // Native only. Without this `--platform all` (eas update in mobile-dev-deploy.yml)
    // also exports web, which fails: react-native-web isn't installed.
    platforms: ['ios', 'android'],
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: ['oneplan', GOOGLE_IOS_URL_SCHEME],
    userInterfaceStyle: 'light',
    updates: { url: 'https://u.expo.dev/76fe3987-e628-4a77-97e8-78c4f93a343c' },
    // Fingerprint (hash of the native layer) so an EAS Update only reaches binaries with the
    // exact same native code; required by the develop continuous-deploy workflow.
    runtimeVersion: { policy: 'fingerprint' },
    // The generated infoplist JSON carries the prod display name; override it per variant
    // so Local / Dev / Travel are distinguishable on the home screen.
    // Scoped to `ios`: a flat locale object is also written to Android res/values-b+<lang>/strings.xml,
    // and those Info.plist keys have no default-locale string, so release lint fails (ExtraTranslation).
    locales: {
      en: { ios: { ...infoPlistEn, CFBundleDisplayName: v.name } },
      vi: { ios: { ...infoPlistVi, CFBundleDisplayName: v.name } },
    },
    ios: {
      version: '2.0.0',
      // Same artwork as the native AppIcon.appiconset (light + dark appearance).
      icon: {
        light: './assets/images/icon.png',
        dark: './assets/images/icon-dark.png',
      },
      bundleIdentifier: v.iosBundleId,
      supportsTablet: false,
      associatedDomains: v.linkHosts.map((h) => `applinks:${h}`),
      usesAppleSignIn: true,
      infoPlist: {
        ...infoPlistEn,
        CFBundleDisplayName: v.name,
        SKAdNetworkItems: skAdNetworkItems,
        LSApplicationQueriesSchemes: ['instagram-stories', 'instagram'],
        ITSAppUsesNonExemptEncryption: false,
      },
      entitlements: {
        'aps-environment': VARIANT === 'prod' ? 'production' : 'development',
      },
    },
    android: {
      version: '2.0.0',
      package: v.androidPackage,
      googleServicesFile: googleServicesJson,
      adaptiveIcon: {
        backgroundColor: '#FFFFFF',
        // Layers lifted from the native app (android/art/generate-launcher-icons.sh output).
        foregroundImage: './assets/images/android-icon-foreground.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: v.linkHosts.flatMap((host) =>
            ['/join', '/friend', '/listing'].map((pathPrefix) => ({
              scheme: 'https',
              host,
              pathPrefix,
            })),
          ),
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    plugins: [
      [
        'react-native-google-mobile-ads',
        {
          iosAppId: 'ca-app-pub-4439567744603735~4925069321',
          androidAppId:
            process.env.ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713',
          delayAppMeasurementInit: true,
        },
      ],
      [
        'expo-tracking-transparency',
        {
          userTrackingPermission: infoPlistEn.NSUserTrackingUsageDescription,
        },
      ],
      'expo-router',
      [
        'expo-splash-screen',
        {
          // First frame of `AnimatedSplash` (SplashScreenView.swift): the logo cut out of black.
          backgroundColor: '#000000',
          image: './assets/images/splash-logo.png',
          imageWidth: 120,
        },
      ],
      [
        'expo-font',
        {
          fonts: [
            './assets/fonts/BeVietnamPro-Thin.ttf',
            './assets/fonts/BeVietnamPro-ThinItalic.ttf',
            './assets/fonts/BeVietnamPro-ExtraLight.ttf',
            './assets/fonts/BeVietnamPro-ExtraLightItalic.ttf',
            './assets/fonts/BeVietnamPro-Light.ttf',
            './assets/fonts/BeVietnamPro-LightItalic.ttf',
            './assets/fonts/BeVietnamPro-Regular.ttf',
            './assets/fonts/BeVietnamPro-Italic.ttf',
            './assets/fonts/BeVietnamPro-Medium.ttf',
            './assets/fonts/BeVietnamPro-MediumItalic.ttf',
            './assets/fonts/BeVietnamPro-SemiBold.ttf',
            './assets/fonts/BeVietnamPro-SemiBoldItalic.ttf',
            './assets/fonts/BeVietnamPro-Bold.ttf',
            './assets/fonts/BeVietnamPro-BoldItalic.ttf',
            './assets/fonts/BeVietnamPro-ExtraBold.ttf',
            './assets/fonts/BeVietnamPro-ExtraBoldItalic.ttf',
            './assets/fonts/BeVietnamPro-Black.ttf',
            './assets/fonts/BeVietnamPro-BlackItalic.ttf',
            './assets/fonts/InstrumentSerif-Regular.ttf',
            './assets/fonts/InstrumentSerif-Italic.ttf',
          ],
        },
      ],
      'expo-status-bar',
      'expo-secure-store',
      // @privy-io/expo's main entrypoint statically imports expo-web-browser (used for its OAuth
      // flows, which this custom-auth-only integration never calls) — Metro fails to bundle
      // without it even though it's an "optional" peer dependency (spike notes: local audit pack, not in the repo).
      'expo-web-browser',
      'expo-localization',
      'expo-apple-authentication',
      [
        'expo-notifications',
        {
          icon: './assets/images/notification-icon.png',
          color: '#335CFF',
          defaultChannel: 'default',
        },
      ],
      'expo-image',
      'expo-video',
      '@react-native-community/datetimepicker',
      'expo-task-manager',
      [
        'expo-share-intent',
        {
          iosShareExtensionBundleIdentifier: `${v.iosBundleId}.ShareExtension`,
          // One group for every variant, as in the native app (OnePlan.entitlements): it is already
          // registered on the Apple team and attached to the dev/prod app ids.
          iosAppGroupIdentifier: 'group.lumilabs.oneplan',
          iosActivationRules: {
            NSExtensionActivationSupportsWebURLWithMaxCount: 1,
            NSExtensionActivationSupportsText: true,
          },
          androidIntentFilters: ['text/*'],
        },
      ],
      'expo-iap',
      // Local only: products come from the StoreKit file (no ASC products for the local bundle id).
      ...(VARIANT === 'local'
        ? [['./plugins/withStoreKitConfig', { file: './config/OnePlan.storekit' }] as [string, object]]
        : []),
      [
        'expo-image-picker',
        {
          photosPermission: infoPlistEn.NSPhotoLibraryUsageDescription,
        },
      ],
      [
        'expo-media-library',
        {
          savePhotosPermission: infoPlistEn.NSPhotoLibraryAddUsageDescription,
          isAccessMediaLocationEnabled: false,
        },
      ],
      ['@react-native-google-signin/google-signin', { iosUrlScheme: GOOGLE_IOS_URL_SCHEME }],
      // Google Maps on iOS too (GMSApiKey + GoogleMaps pod); omitted key → no Google subspec.
      [
        'react-native-maps',
        {
          iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
          // Required: without it the plugin strips com.google.android.geo.API_KEY from the
          // manifest (even one set via android.config.googleMaps) → MapView crashes on attach.
          androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission: infoPlistEn.NSLocationWhenInUseUsageDescription,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      [
        'expo-audio',
        {
          microphonePermission: infoPlistEn.NSMicrophoneUsageDescription,
        },
      ],
      ['expo-camera', { cameraPermission: infoPlistEn.NSCameraUsageDescription }],
      ['expo-local-authentication', { faceIDPermission: infoPlistEn.NSFaceIDUsageDescription }],
      // Android release: R8 minify + resource shrinking (smaller APK/AAB, less dex to load).
      [
        'expo-build-properties',
        {
          // Xcode 27 / iOS 27 SDK refuses to launch apps without the UIScene lifecycle.
          // SDK 57's template still uses the app lifecycle; this opts prebuild into Expo's
          // ExpoAppSceneDelegate (expo >= 57.0.23). No-op (warns) on SDK 58+, remove then.
          ios: {
            enableSceneSupport: true,
          },
          android: {
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      adUnits: {
        ios: {
          rewarded: 'ca-app-pub-4439567744603735/6917376062',
          endTrip: 'ca-app-pub-4439567744603735/9779463264',
          market: 'ca-app-pub-4439567744603735/8748764266',
        },
        android: {
          rewarded: process.env.ADMOB_ANDROID_APP_ID
            ? process.env.ADMOB_ANDROID_REWARDED_UNIT_ID || ''
            : '',
          endTrip: process.env.ADMOB_ANDROID_APP_ID
            ? process.env.ADMOB_ANDROID_END_TRIP_UNIT_ID || ''
            : '',
          market: process.env.ADMOB_ANDROID_APP_ID
            ? process.env.ADMOB_ANDROID_MARKET_UNIT_ID || ''
            : '',
        },
      },
      variant: VARIANT,
      apiUrl,
      linkHosts: v.linkHosts,
      googleIosClientId: GOOGLE_IOS_CLIENT_ID,
      googleWebClientId: GOOGLE_WEB_CLIENT_ID,
      foursquareApiKey: process.env.FOURSQUARE_API_KEY ?? 'unset',
      // Only the presence is exposed to JS: without a key the Google Maps SDK throws
      // `API key not found` on the first MapView (see native/maps/provider.ts).
      googleMapsAndroidConfigured: !!process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      googleMapsIosConfigured: !!process.env.GOOGLE_MAPS_IOS_API_KEY,
      facebookAppId: process.env.FACEBOOK_APP_ID ?? 'unset',
      // No real Privy app exists yet (operator has not created one) — empty means the wallet
      // provider renders a "not configured" state rather than mounting the Privy SDK.
      privyAppId: process.env.PRIVY_APP_ID ?? 'unset',
      privyClientId: process.env.PRIVY_CLIENT_ID ?? 'unset',
      eas: {
        projectId: '76fe3987-e628-4a77-97e8-78c4f93a343c',
      },
    },
  });
