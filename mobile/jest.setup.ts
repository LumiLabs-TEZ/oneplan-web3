process.env.RNTL_SKIP_AUTO_CLEANUP = 'true';

// QueryClient itself owns query/mutation GC timers. Track every instance, including clients
// created directly in older tests, so cleanup is not dependent on callers remembering a helper.
const trackedQueryClients = new Set<{
  clear: () => void;
  getMutationCache?: () => { getAll: () => { destroy: () => void }[] };
}>();
jest.doMock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query') as {
    QueryClient: new (...args: never[]) => {
      clear: () => void;
      getMutationCache: () => { getAll: () => { destroy: () => void }[] };
    };
  } & Record<string, unknown>;
  class TrackedQueryClient extends actual.QueryClient {
    constructor(...args: never[]) {
      super(...args);
      trackedQueryClients.add(this);
    }
  }
  return { ...actual, QueryClient: TrackedQueryClient };
});
(
  globalThis as typeof globalThis & { __onePlanTrackedQueryClients?: typeof trackedQueryClients }
).__onePlanTrackedQueryClients = trackedQueryClients;

jest.mock('@/native/qrMatrix', () => jest.requireActual('@/ui/qrMatrix'));
jest.mock('@/native/legacySession', () => ({
  readLegacySession: jest.fn(async () => null),
  readPreferences: jest.fn(async () => ({})),
}));
/* eslint-disable @typescript-eslint/no-require-imports */
// Fabric-only native view. `ui/components/NumericText` already renders the formatted string in a
// sizing `<Text>`, so the native overlay draws nothing under Jest (queries find the string once).
jest.mock('react-native-numeric-text', () => ({
  NumericText: () => null,
  NumericTextView: () => null,
}));
// Global test setup: MMKV runs in-memory under Jest via its built-in mock,
// SecureStore is replaced with a Map-backed fake.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      store.delete(k);
    }),
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
    __reset: () => store.clear(),
  };
});

// react-native-mmkv v4 loads Nitro at import time; replace with an in-memory store.
jest.mock('react-native-mmkv', () => {
  const instances = new Map<string, Map<string, string | number | boolean>>();
  const createMMKV = (config?: { id?: string }) => {
    const id = config?.id ?? 'default';
    const map = instances.get(id) ?? new Map<string, string | number | boolean>();
    instances.set(id, map);
    return {
      set: (k: string, v: string | number | boolean) => map.set(k, v),
      getString: (k: string) =>
        typeof map.get(k) === 'string' ? (map.get(k) as string) : undefined,
      getNumber: (k: string) =>
        typeof map.get(k) === 'number' ? (map.get(k) as number) : undefined,
      getBoolean: (k: string) =>
        typeof map.get(k) === 'boolean' ? (map.get(k) as boolean) : undefined,
      contains: (k: string) => map.has(k),
      remove: (k: string) => map.delete(k),
      getAllKeys: () => [...map.keys()],
      clearAll: () => map.clear(),
      trim: () => undefined,
    };
  };
  return { createMMKV, existsMMKV: () => true, deleteMMKV: () => undefined };
});

// --- Phase 1 native module mocks -------------------------------------------
require('react-native-reanimated').setUpTests();
require('react-native-gesture-handler/jestSetup');

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const mock = require('@gorhom/bottom-sheet/mock');
  const Inner = mock.BottomSheetModal;
  // The upstream mock drops `footerComponent`; render it after the children so footer buttons
  // (AppSheet `footer`) are reachable in tests. `ref` still targets the mock modal (present/dismiss).
  const BottomSheetModal = React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Inner, { ...props, ref }),
      props.footerComponent
        ? React.createElement(props.footerComponent as React.FC<object>, {
            animatedFooterPosition: { value: 0 },
          })
        : null,
    ),
  );
  BottomSheetModal.displayName = 'BottomSheetModalMock';
  BottomSheetModal.prototype = Inner.prototype;
  return {
    ...mock,
    BottomSheetModal,
    BottomSheetFooter: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-image', () => {
  const React = require('react');
  const { Image: RNImage } = require('react-native');
  return {
    Image: (props: Record<string, unknown>) => React.createElement(RNImage, props),
  };
});

jest.mock('expo-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    VideoView: (props: Record<string, unknown>) => React.createElement(View, props),
    useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), loop: false, muted: false }),
  };
});

jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BlurTargetView: View,
    BlurView: (props: Record<string, unknown>) => React.createElement(View, props),
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: (props: Record<string, unknown>) => React.createElement(View, props),
  };
});

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: 'ios', data: 'test-token' })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  registerTaskAsync: jest.fn(async () => undefined),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { DEFAULT: 3, HIGH: 4, MAX: 5 },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '2.0.0',
  nativeBuildVersion: '1',
}));

jest.mock('expo-updates', () => ({
  isEnabled: false,
  isEmbeddedLaunch: true,
  updateId: null,
  channel: null,
  checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })),
  fetchUpdateAsync: jest.fn(async () => ({ isNew: false })),
  reloadAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid'),
  digestStringAsync: jest.fn(async (_algo: string, data: string) => `sha256(${data})`),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(async () => ({
    user: 'apple-user-id',
    identityToken: 'apple-id-token',
    email: null,
    fullName: null,
  })),
  getCredentialStateAsync: jest.fn(async () => 1),
  addRevokeListener: jest.fn(() => ({ remove: jest.fn() })),
  isAvailableAsync: jest.fn(async () => true),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationCredentialState: { REVOKED: 0, AUTHORIZED: 1, NOT_FOUND: 2, TRANSFERRED: 3 },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({ type: 'cancelled', data: null })),
    signOut: jest.fn(async () => null),
  },
  isSuccessResponse: (r: { type: string }) => r.type === 'success',
}));

// `src/lib/env.ts` throws at import without expo config extras; give every suite a dev env.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        variant: 'dev',
        apiUrl: 'https://api.test',
        linkHosts: [],
        googleIosClientId: 'test-ios-client-id',
        googleWebClientId: 'test-web-client-id',
        foursquareApiKey: 'test-key',
        // Tests render as iOS; a dev build ships the iOS Google Maps key, so MapView mounts.
        googleMapsIosConfigured: true,
        facebookAppId: 'test-fb',
      },
    },
  },
}));

jest.mock('sp-react-native-in-app-updates', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    checkNeedsUpdate: jest.fn(async () => ({ shouldUpdate: false })),
    startUpdate: jest.fn(async () => undefined),
  })),
  IAUUpdateKind: { FLEXIBLE: 0, IMMEDIATE: 1 },
}));

jest.mock('expo-device', () => ({
  isDevice: true,
  osVersion: '26.0',
  modelName: 'iPhone',
}));

// --- Phase 2 native module mocks -------------------------------------------
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
  })),
  MediaTypeOptions: { Images: 'Images', Videos: 'Videos', All: 'All' },
}));

// SDK 57 still ships the deprecated `manipulateAsync(uri, actions, saveOptions)` alongside the
// new contextual `ImageManipulator.manipulate()` API (node_modules/expo-image-manipulator/build/
// ImageManipulator.d.ts); `uploadService.ts` (M1.5) uses `manipulateAsync`, so mock that as a
// passthrough that ignores the actions/save options and returns the source uri.
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async (uri: string) => ({ uri, width: 100, height: 100 })),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  FlipType: { Vertical: 'vertical', Horizontal: 'horizontal' },
}));

// SDK 57 moved `downloadAsync` etc. to `expo-file-system/legacy` (the top-level package now
// exports the new File/Directory API, node_modules/expo-file-system/build/index.d.ts); mock both
// entry points so either import path resolves in tests.
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///doc/',
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(async (_uri: string, fileUri: string) => ({ uri: fileUri, status: 200 })),
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(async (_uri: string, fileUri: string) => ({
    uri: fileUri,
    status: 200,
  })),
  // `uploadService.ts` (M2.2) falls back to `uploadAsync` when the blob-based PUT throws.
  uploadAsync: jest.fn(async () => ({ status: 200, headers: {}, mimeType: null, body: '' })),
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

jest.mock('expo-media-library', () => ({
  saveToLibraryAsync: jest.fn(async () => undefined),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
}));

jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('expo-share-intent', () => ({
  getShareExtensionKey: () => 'oneplan-share-intent',
  ShareIntentProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock('react-native-qrcode-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => React.createElement(View, props),
  };
});

// `@react-native-community/datetimepicker` (M2.3 `TimeRow`) ships no jest preset; mock the
// default view component plus the Android imperative `DateTimePickerAndroid.open` API
// (node_modules/@react-native-community/datetimepicker/src/index.d.ts).
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  const RNDateTimePicker = (props: Record<string, unknown>) =>
    React.createElement(View, { testID: 'date-time-picker', ...props });
  return {
    __esModule: true,
    default: RNDateTimePicker,
    DateTimePickerAndroid: {
      open: jest.fn(),
      dismiss: jest.fn(),
    },
  };
});

// --- Phase 3 native module mocks -------------------------------------------
// react-native-maps has no jest preset; mock the pieces used by map cards/screens.
// MapView forwards its ref so `useOrbitCamera`-style hooks can call the camera methods.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({
      animateCamera: jest.fn(),
      animateToRegion: jest.fn(),
      fitToCoordinates: jest.fn(),
      setCamera: jest.fn(),
      getCamera: jest.fn(async () => ({
        center: { latitude: 10.77, longitude: 106.7 },
        heading: 0,
        pitch: 0,
        altitude: 1000,
        zoom: 15,
      })),
    }));
    return React.createElement(View, props);
  });
  MapView.displayName = 'MapViewMock';
  const Marker = (props: Record<string, unknown>) => React.createElement(View, props);
  const Polyline = (props: Record<string, unknown>) => React.createElement(View, props);
  const Callout = View;
  return {
    __esModule: true,
    default: MapView,
    Marker,
    Polyline,
    Callout,
    PROVIDER_GOOGLE: 'google',
    PROVIDER_DEFAULT: undefined,
  };
});

// expo-location: grant permissions, fix a Ho Chi Minh City test coordinate, no-op subscriptions.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  })),
  getForegroundPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: {
      latitude: 10.77,
      longitude: 106.7,
      altitude: null,
      accuracy: 5,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  watchHeadingAsync: jest.fn(async (_cb: (h: unknown) => void) => ({ remove: jest.fn() })),
  reverseGeocodeAsync: jest.fn(async () => [{ name: 'Test', street: 'St', city: 'City' }]),
  geocodeAsync: jest.fn(async () => []),
  hasServicesEnabledAsync: jest.fn(async () => true),
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
}));

// expo-audio: node_modules/expo-audio/build/{ExpoAudio,AudioModule,AudioModule.types,
// utils/useAudioRecorderState,RecordingConstants}.d.ts — verified exact API before mocking.
jest.mock('expo-audio', () => {
  const recorder = {
    id: 'test-recorder',
    currentTime: 0,
    isRecording: false,
    uri: null as string | null,
    record: jest.fn(),
    stop: jest.fn(async () => undefined),
    pause: jest.fn(),
    prepareToRecordAsync: jest.fn(async () => undefined),
    getStatus: jest.fn(() => ({
      canRecord: true,
      isRecording: false,
      durationMillis: 0,
      mediaServicesDidReset: false,
      metering: -160,
      url: null,
    })),
  };
  const player = {
    id: 'test-player',
    playing: false,
    muted: false,
    loop: false,
    paused: true,
    isLoaded: true,
    currentTime: 0,
    duration: 0,
    volume: 1,
    play: jest.fn(),
    pause: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    remove: jest.fn(),
  };
  return {
    useAudioRecorder: jest.fn(() => recorder),
    useAudioRecorderState: jest.fn(() => ({
      canRecord: true,
      isRecording: false,
      durationMillis: 0,
      mediaServicesDidReset: false,
      metering: -160,
      url: null,
    })),
    useAudioPlayer: jest.fn(() => player),
    useAudioPlayerStatus: jest.fn(() => ({
      id: 'test-player',
      currentTime: 0,
      playbackState: 'idle',
      timeControlStatus: 'paused',
      reasonForWaitingToPlay: '',
      mute: false,
      duration: 0,
      playing: false,
      loop: false,
      didJustFinish: false,
      isBuffering: false,
      isLoaded: true,
      playbackRate: 1,
      shouldCorrectPitch: true,
      isLive: false,
      currentOffsetFromLive: null,
      error: null,
    })),
    createAudioPlayer: jest.fn(() => player),
    setAudioModeAsync: jest.fn(async () => undefined),
    AudioModule: {
      requestRecordingPermissionsAsync: jest.fn(async () => ({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        expires: 'never',
      })),
    },
    RecordingPresets: {
      HIGH_QUALITY: {
        extension: '.m4a',
        sampleRate: 44100,
        numberOfChannels: 2,
        bitRate: 128000,
        android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
        ios: { outputFormat: 'aac ', audioQuality: 127, linearPCMBitDepth: 16 },
        web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
      },
      LOW_QUALITY: {
        extension: '.m4a',
        sampleRate: 44100,
        numberOfChannels: 2,
        bitRate: 64000,
        android: { extension: '.3gp', outputFormat: '3gp', audioEncoder: 'amr_nb' },
        ios: { audioQuality: 0, outputFormat: 'aac ', linearPCMBitDepth: 16 },
        web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
      },
    },
  };
});

// --- Phase 4 native module mocks ---
// expo-iap: node_modules/expo-iap/build/index.d.ts (top-level exports) plus
// node_modules/expo-iap/build/modules/{ios,android}.d.ts (the *IOS / *Android suffixed helpers,
// re-exported via `export * from './modules/ios'` / `'./modules/android'` in index.d.ts).
jest.mock('expo-iap', () => ({
  initConnection: jest.fn(async () => true),
  endConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(async () => []),
  requestPurchase: jest.fn(async () => undefined),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  finishTransaction: jest.fn(async () => undefined),
  getAvailablePurchases: jest.fn(async () => []),
  restorePurchases: jest.fn(async () => undefined),
  syncIOS: jest.fn(async () => true),
  isEligibleForIntroOfferIOS: jest.fn(async () => false),
  // `openRedeemOfferCode` (index.d.ts:384) supersedes the deprecated
  // `presentCodeRedemptionSheetIOS` (modules/ios.d.ts:161-166); both kept while callers migrate.
  openRedeemOfferCode: jest.fn(async () => null),
  presentCodeRedemptionSheetIOS: jest.fn(async () => undefined),
  showManageSubscriptionsIOS: jest.fn(async () => undefined),
  deepLinkToSubscriptions: jest.fn(async () => undefined),
  getPendingTransactionsIOS: jest.fn(async () => []),
  consumePurchaseAndroid: jest.fn(async () => undefined),
  isUserCancelledError: jest.fn(() => false),
}));

// expo-camera: node_modules/expo-camera/build/CameraView.d.ts (default `CameraView` export) and
// node_modules/expo-camera/build/index.d.ts (`useCameraPermissions`).
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props: Record<string, unknown>) => React.createElement(View, props),
    useCameraPermissions: jest.fn(() => [
      { granted: true, status: 'granted' },
      jest.fn(async () => ({ granted: true, status: 'granted' })),
    ]),
    // Photo-library QR fallback (`src/native/camera/QRScanner.tsx` `pickQrFromPhoto`) — no code
    // found by default; tests override with `.mockResolvedValueOnce`.
    scanFromURLAsync: jest.fn(async () => []),
  };
});

// expo-local-authentication: node_modules/expo-local-authentication/build/LocalAuthentication.d.ts
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

// expo-sms: node_modules/expo-sms/build/SMS.d.ts
jest.mock('expo-sms', () => ({
  isAvailableAsync: jest.fn(async () => true),
  sendSMSAsync: jest.fn(async () => ({ result: 'sent' })),
}));

// expo-store-review: node_modules/expo-store-review/build/StoreReview.d.ts
jest.mock('expo-store-review', () => ({
  requestReview: jest.fn(async () => undefined),
  hasAction: jest.fn(async () => true),
}));

// react-native-view-shot: node_modules/react-native-view-shot/lib/index.d.ts (built from src/index.tsx)
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///tmp/passport.png'),
  releaseCapture: jest.fn(),
}));

// react-native-share: node_modules/react-native-share/lib/typescript/index.d.ts (default export
// with `open`, `shareSingle`, `Social`) + types.d.ts (`isPackageInstalled` -> `IsPackageInstalledResult`).
jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {
    shareSingle: jest.fn(async () => ({ success: true })),
    open: jest.fn(async () => ({ success: true })),
    isPackageInstalled: jest.fn(async () => ({ isInstalled: true, message: '' })),
    Social: { INSTAGRAM_STORIES: 'instagramstories' },
  },
}));

// expo-clipboard: node_modules/expo-clipboard/build/Clipboard.d.ts
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
}));

// Phase 5 ads remain native boundaries; tests explicitly emit lifecycle events.
jest.mock('expo-tracking-transparency', () => ({
  requestTrackingPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
}));
jest.mock('react-native-google-mobile-ads', () => {
  const create = jest.fn(() => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    return {
      load: jest.fn(),
      show: jest.fn(async () => undefined),
      addAdEventListener: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(fn);
        return () => listeners.get(event)?.delete(fn);
      }),
      emit: (event: string) => listeners.get(event)?.forEach((fn) => fn()),
    };
  });
  return {
    __esModule: true,
    default: () => ({ initialize: jest.fn(async () => []) }),
    AdsConsent: {
      gatherConsent: jest.fn(async () => ({
        canRequestAds: true,
        privacyOptionsRequirementStatus: 'NOT_REQUIRED',
      })),
      getConsentInfo: jest.fn(async () => ({
        canRequestAds: true,
        privacyOptionsRequirementStatus: 'NOT_REQUIRED',
      })),
      showPrivacyOptionsForm: jest.fn(async () => undefined),
    },
    AdsConsentPrivacyOptionsRequirementStatus: { REQUIRED: 'REQUIRED' },
    AdEventType: { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error' },
    RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'earned' },
    InterstitialAd: { createForAdRequest: create },
    RewardedAd: { createForAdRequest: create },
    TestIds: { REWARDED: 'test-rewarded', INTERSTITIAL: 'test-interstitial' },
  };
});

// @solana/web3.js v1's CJS bundle pulls in `jayson`/`uuid`'s browser ESM builds at require time
// (Jest's react-native module-resolution condition picks their `.mjs`/`esm-browser` entries,
// several packages deep), which is a well-known Jest pain point for this library and not worth
// chasing through `transformIgnorePatterns`. `useVaultWallet.ts` only needs
// `VersionedTransaction.deserialize`/`.serialize` for the sign step — stand in with the
// codebase's own already-ported legacy-transaction parser (`solana/transactionVerifier.ts`) for
// structural validation, since real behavior there (throws on malformed bytes, round-trips valid
// ones) is what the tests actually need, not `@solana/web3.js`'s own wire-format implementation.
jest.mock('@solana/web3.js', () => {
  class VersionedTransaction {
    bytes: Uint8Array;
    constructor(bytes: Uint8Array) {
      this.bytes = bytes;
    }
    static deserialize(bytes: Uint8Array): VersionedTransaction {
      const { decodeTransaction } = require('@/features/vault/solana/transactionVerifier') as {
        decodeTransaction: (base64: string) => unknown;
      };
      decodeTransaction(Buffer.from(bytes).toString('base64'));
      return new VersionedTransaction(bytes);
    }
    serialize(): Uint8Array {
      return this.bytes;
    }
  }
  return { VersionedTransaction };
});

// MWA ships a Kotlin native module; under jest every test that reaches `mwaSession` drives
// `transact` itself via `jest.mocked(transact)`. Default: no wallet installed.
jest.mock('@solana-mobile/mobile-wallet-adapter-protocol-web3js', () => ({
  transact: jest.fn(() => {
    const error = new Error('no wallet') as Error & { code: string };
    error.code = 'ERROR_WALLET_NOT_FOUND';
    return Promise.reject(error);
  }),
}));

// @privy-io/expo: no jest preset, and its hooks are only meaningfully driven from
// `useVaultWallet.test.ts` via `jest.mocked(usePrivy)`/`jest.mocked(useEmbeddedSolanaWallet)`.
// Default state here is "ready, no wallet" so any other test that happens to render
// `PrivyVaultProvider` (unlikely — it's not on the render tree in most suites) does not throw.
jest.mock('@privy-io/expo', () => {
  return {
    // `jest.fn` (not a plain arrow) so `PrivyVaultProvider.test.tsx` can assert it was never
    // mounted when unconfigured / the web3 flag is off.
    PrivyProvider: jest.fn(({ children }: { children: unknown }) => children),
    usePrivy: jest.fn(() => ({
      user: null,
      isReady: true,
      error: null,
      logout: jest.fn(async () => undefined),
      getAccessToken: jest.fn(async () => null),
      refreshUser: jest.fn(async () => ({ user: null })),
    })),
    useEmbeddedSolanaWallet: jest.fn(() => ({ status: 'not-created', create: jest.fn() })),
  };
});

jest.mock('expo-glass-effect', () => ({
  GlassView: require('react-native').View,
  isLiquidGlassAvailable: () => false,
}));

// Native UIMenu is a leaf native view; render children and record each instance's props so
// tests can fire `onPressAction` / assert the action list (`__menuInstances`, cleared per test).
jest.mock('@react-native-menu/menu', () => {
  const React = require('react');
  const { View } = require('react-native');
  const __menuInstances: {
    actions: { id?: string; title: string; state?: string }[];
    onPressAction?: (event: { nativeEvent: { event: string } }) => void;
    testID?: string;
  }[] = [];
  const MenuView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    const { children, actions, onPressAction, testID, ...rest } = props;
    __menuInstances.push({
      actions: actions as { id?: string; title: string; state?: string }[],
      onPressAction: onPressAction as never,
      testID: testID as string | undefined,
    });
    React.useImperativeHandle(ref, () => ({ openMenu: jest.fn(), closeMenu: jest.fn() }), []);
    return React.createElement(View, { ...rest, testID }, children);
  });
  MenuView.displayName = 'MenuViewMock';
  return { MenuView, __menuInstances, __resetMenuInstances: () => (__menuInstances.length = 0) };
});

// Keep teardown in one place and make its order explicit: rendered trees first, then test-owned
// clients, then the app singleton. QueryClientProvider owns the client's mount ref-count, so after
// React unmounts the tree we clear caches without calling `unmount()` a second time (which would
// underflow that ref-count and retain focus/online subscriptions).
afterEach(async () => {
  const { cleanup } = require('@testing-library/react-native/pure') as {
    cleanup: () => Promise<void>;
  };
  await cleanup();

  const { disposeTestQueryClients } = require('@/testSupport/queryClient') as {
    disposeTestQueryClients: () => void;
  };
  disposeTestQueryClients();

  const { queryClient } = require('@/api/queryClient') as {
    queryClient: {
      clear: () => void;
      getMutationCache?: () => { getAll: () => { destroy: () => void }[] };
    };
  };
  for (const mutation of queryClient.getMutationCache?.().getAll() ?? []) mutation.destroy();
  queryClient.clear();
  trackedQueryClients.delete(queryClient);

  for (const client of trackedQueryClients) {
    for (const mutation of client.getMutationCache?.().getAll() ?? []) mutation.destroy();
    client.clear();
  }
  trackedQueryClients.clear();
});
