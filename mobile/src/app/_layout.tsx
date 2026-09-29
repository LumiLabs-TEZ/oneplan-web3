import '@/push/backgroundTask';
import { useBadgeClear } from '@/push/useBadgeClear';
import { installBoardSignOutHook } from '@/features/board/signOutHook';
import { useBoardLifecycle } from '@/features/board/useBoardLifecycle';
import { useExtractionShare } from '@/native/share/useExtractionShare';

import { QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { Stack, useSegments } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, InteractionManager, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

import { useAnalyticsLifecycle } from '@/analytics/useAnalyticsLifecycle';
import { gcPersistedQueries, queryClient } from '@/api/queryClient';
import { useAppleCredentialWatcher } from '@/auth/appleRevocation';
import { useAuthStore } from '@/auth/authStore';
import { resolveRootRoute } from '@/auth/gate';
import { tokenStore } from '@/auth/tokenStore';
import { friendProfileSheetOptions } from '@/features/friends/friendProfilePresentation';
import { installInviteSignOutHook } from '@/features/invite/signOutHook';
import { useInviteRealtimeBridge } from '@/features/invite/useInviteRealtimeBridge';
import { usePendingInvitesSync } from '@/features/invite/usePendingInvitesSync';
import { AnimatedSplash } from '@/features/shell/AnimatedSplash';
import {
  installVaultSignOutHook,
  useWalletAuthBootstrap,
} from '@/features/vault/wallet/authBootstrap';
import { useWeb3Enabled } from '@/features/vault/web3Flag';
import { web3RootScreens } from '@/features/vault/web3RootScreens';
import { PrivyVaultProvider } from '@/features/vault/wallet/PrivyVaultProvider';
import { installStoreSignOutHook, useStoreInit } from '@/iap';
import { initI18n } from '@/i18n';
import { isProd } from '@/lib/env';
import { installLinksSignOutHook } from '@/links/signOutHook';
import { useLinkResolver } from '@/links/useLinkResolver';
import { useUrlListener } from '@/links/useUrlListener';
import { useVersionGate, type UpdateInfo } from '@/native/versionGate';
import { computeOnline, installDevOfflineOverride } from '@/offline/devOffline';
import { installPushSignOutHook, usePushRegistration } from '@/push/registration';
import { usePushResponseRouter } from '@/push/responses';
import { installRealtimeSignOutHook } from '@/realtime/signOutHook';
import { useRealtime } from '@/realtime/useRealtime';
import { migrateNativePreferences, useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();
initI18n();
installPushSignOutHook(); // DELETE /devices/token before tokens are cleared on sign-out
installRealtimeSignOutHook(); // close the realtime socket + drop its effects on sign-out
installInviteSignOutHook(); // clear pending trip invites on sign-out
installLinksSignOutHook(); // clear the parked deep link on sign-out
installBoardSignOutHook();
installStoreSignOutHook(); // drop cached IAP products/flags on sign-out (keeps the connection)
installVaultSignOutHook(); // reset the embedded wallet + Privy session on sign-out

// TanStack Query ↔ device state (replaces the iOS NetworkMonitor + scenePhase glue).
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) =>
    setOnline(computeOnline(Boolean(state.isConnected && state.isInternetReachable !== false))),
  ),
);
if (!isProd) installDevOfflineOverride(); // `(dev)/offline` force-offline switch for e2e runs

// Fonts: no runtime `useFonts` — the `expo-font` config plugin (app.config.ts) embeds every
// BeVietnamPro / InstrumentSerif face natively under its PostScript name (= file name).

/** Rarely shown hard update gate; required on demand so it stays off the cold-start path. */
function LazyUpdateRequired({ info }: { info: UpdateInfo }) {
  const { UpdateRequired } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/ui/screens/UpdateRequired') as typeof import('@/ui/screens/UpdateRequired');
  return <UpdateRequired info={info} />;
}

/** Hooks that need the auth state + navigator; kept out of RootLayout so they run after hydration. */
function SessionEffects({ ready }: { ready: boolean }) {
  useBadgeClear();
  useBoardLifecycle(ready);
  useExtractionShare();
  useAnalyticsLifecycle();
  useAppleCredentialWatcher();
  usePushRegistration();
  usePushResponseRouter({ ready });
  useLinkResolver({ ready });
  useUrlListener();
  useRealtime();
  useStoreInit();
  useInviteRealtimeBridge();
  usePendingInvitesSync();
  useWalletAuthBootstrap();
  return null;
}

/**
 * The root navigator. Lives below `QueryClientProvider` because `useWeb3Enabled` runs react-query
 * hooks; `Stack` needs `Stack.Screen` as direct children, so the whole navigator moves here.
 */
function RootStack({ route }: { route: ReturnType<typeof resolveRootRoute> }) {
  const web3Enabled = useWeb3Enabled();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={route === 'onboarding'}>
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={route === 'login'}>
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={route === 'app'}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trips/ended" />
        <Stack.Screen name="trip/[tripId]" />
        {/* Pushed, like `CreateTripView` on the iOS Trip stack (`TripView.swift:174`). */}
        <Stack.Screen name="trip/new" />
        <Stack.Screen name="profile" />
        {/* Friends list / trip members → friend profile sheet. */}
        <Stack.Screen name="friend-profile/[userId]" options={friendProfileSheetOptions} />
        <Stack.Screen name="board" />
        {/* Trip → Your plan → "Explore on market" enters at the feed index and is a
          `.fullScreenCover` on iOS (`TripPlanSection.swift:523`); deeper entries
          (Market tab → listing) stay pushed. */}
        <Stack.Screen
          name="market"
          options={({ route }) => ({
            presentation:
              (route.params as { screen?: string } | undefined)?.screen === 'index'
                ? 'fullScreenModal'
                : 'card',
          })}
        />
        <Stack.Screen
          name="missions"
          options={{
            presentation: 'transparentModal',
            animation: 'none',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal' }} />
        {web3RootScreens(web3Enabled)}
        <Stack.Screen
          name="free-trial"
          options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
        />
        <Stack.Screen name="join" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen
          name="friend/[code]"
          options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
        />
        <Stack.Screen
          name="friend-request/[id]"
          options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
        />
        <Stack.Screen name="_parked" options={{ animation: 'none' }} />
      </Stack.Protected>
      <Stack.Protected guard={!isProd}>
        <Stack.Screen name="(dev)/foundation-reference" options={{ headerShown: false }} />
        <Stack.Screen name="(dev)/missions-reference" options={{ headerShown: false }} />
        <Stack.Screen name="(dev)/market-reference" options={{ headerShown: false }} />
        <Stack.Screen name="(dev)/offline" options={{ headerShown: false }} />
        <Stack.Screen name="(dev)/receipt" options={{ headerShown: false }} />
        <Stack.Screen name="(dev)/web3-flag" options={{ headerShown: false }} />
        <Stack.Screen name="(dev)/vault-kit" options={{ headerShown: false }} />
        <Stack.Screen name="(dev)/web3-wave-a" options={{ headerShown: false }} />
        <Stack.Screen name="(dev)/vault-pay" options={{ headerShown: false }} />
        <Stack.Screen name="(dev)/vault-leave" options={{ headerShown: false }} />
        <Stack.Screen name="(dev)/vault-wave-c" options={{ headerShown: false }} />
        <Stack.Screen name="(dev)/vault-wave-d" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const segments = useSegments();
  const isReference =
    !isProd && segments.some((segment) => segment.endsWith('-reference') || segment === 'receipt');
  const [tokensReady, setTokensReady] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  // Cold-start reveal (SplashScreenView.swift); RootLayout mounts once, so it never replays on resume.
  const [showSplash, setShowSplash] = useState(!isReference);
  const setReady = useAuthStore((s) => s.setReady);
  const status = useAuthStore((s) => s.status);
  const hasSeenOnboarding = useSettingsStore((s) => s.hasSeenOnboarding);
  // Gate order from OnePlanApp.swift:62-137 — onboarding → login → app.
  const route = resolveRootRoute({ hasSeenOnboarding, status });
  // Client-side forced-update gate (VersionCheckManager.swift / AppUpdateGate.kt); fail-open.
  const updateInfo = useVersionGate(!isReference);

  useEffect(() => {
    void Promise.allSettled([tokenStore.hydrate(), migrateNativePreferences()]).then(() => {
      // Secure/native storage can be temporarily unavailable. The app can still route to the
      // anonymous experience, while an unset migration marker makes the native read retryable on
      // the next launch. Do not infer onboarding state from credentials.
      setReady();
      setTokensReady(true);
      setPreferencesReady(true);
    });
  }, [setReady]);

  useEffect(() => {
    // One-shot sweep of expired / version-busted MMKV query rows, off the startup frames.
    const task = InteractionManager.runAfterInteractions(() => {
      gcPersistedQueries().catch(() => undefined); // best-effort; entries are re-checked on read
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // AnimatedSplash hides the native splash itself once its identical first frame is drawn.
    if (tokensReady && !showSplash) void SplashScreen.hideAsync();
  }, [tokensReady, showSplash]);

  if (!tokensReady || !preferencesReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <ShareIntentProvider>
          <QueryClientProvider client={queryClient}>
            <PrivyVaultProvider>
              <BottomSheetModalProvider>
                <StatusBar style={showSplash ? 'light' : 'dark'} />
                {!isReference ? <SessionEffects ready={route === 'app' && !updateInfo} /> : null}
                <RootStack route={route} />
                {updateInfo ? <LazyUpdateRequired info={updateInfo} /> : null}
                {showSplash ? <AnimatedSplash onComplete={() => setShowSplash(false)} /> : null}
              </BottomSheetModalProvider>
            </PrivyVaultProvider>
          </QueryClientProvider>
        </ShareIntentProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
