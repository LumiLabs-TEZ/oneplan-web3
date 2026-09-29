/**
 * Fixture gallery for the Wave D screens (end-trip consensus + settlement) — same purpose as
 * `(dev)/vault-kit` for the UI kit: manual/screenshot verification against the Swift originals
 * without needing a live vault trip, a devtunnel'd local server, or real backend data.
 *
 * The 4 screens are not pure presentational components (Review/Waiting/Settlement own their data
 * fetching via TanStack Query), so this renders each real screen against a private `QueryClient`
 * seeded with the fixture DTOs (`@/features/vault/devFixtures/waveD`) — never-stale, so no query
 * fires and the gallery makes zero network calls.
 *
 * Dev-only, same `!isProd` guard as `(dev)/vault-kit`. Open with `dev.lumilabs.oneplan:///vault-wave-d`.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DENIED_REQUEST,
  MY_USER_ID,
  TOTAL_SPENT_VND,
  TRIP_ID,
  makeFixtureClient,
} from '@/features/vault/devFixtures/waveD';
import { TripEndDeniedScreen } from '@/features/vault/screens/TripEndDeniedScreen';
import { TripEndReviewScreen } from '@/features/vault/screens/TripEndReviewScreen';
import { TripEndWaitingScreen } from '@/features/vault/screens/TripEndWaitingScreen';
import { VaultSettlementScreen } from '@/features/vault/screens/VaultSettlementScreen';
import { setAppLanguage, useAppLanguage } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';
import { Button } from '@/ui/components/Button';
import { colors, spacing } from '@/ui/theme';

type ScreenKey = 'review' | 'waiting' | 'denied' | 'settlement';

const SCREENS: { key: ScreenKey; label: string }[] = [
  { key: 'review', label: 'Review' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'denied', label: 'Denied' },
  { key: 'settlement', label: 'Settlement' },
];

function isScreenKey(v: unknown): v is ScreenKey {
  return typeof v === 'string' && SCREENS.some((s) => s.key === v);
}

export default function DevVaultWaveDRoute() {
  // `?screen=waiting` etc. lets a deep link land directly on one state — no on-device taps
  // needed for screenshotting (a stray simulated tap elsewhere in the app is a real risk on a
  // shared emulator). Re-firing this route with a different `?screen=` while it's already
  // mounted updates the param without remounting expo-router's own tree, so the inner component
  // is keyed by it — a fresh key forces a clean remount instead of an effect-driven setState.
  const params = useLocalSearchParams<{ screen?: string }>();
  const initial = isScreenKey(params.screen) ? params.screen : 'review';
  return <DevVaultWaveDScreen key={initial} initialScreen={initial} />;
}

function DevVaultWaveDScreen({ initialScreen }: { initialScreen: ScreenKey }) {
  const language = useAppLanguage();
  const [screen, setScreen] = useState<ScreenKey>(initialScreen);
  const client = useMemo(() => makeFixtureClient(), []);

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="dev-vault-wave-d-screen">
      <View style={styles.toolbar}>
        {SCREENS.map((s) => (
          <Button
            key={s.key}
            title={s.label}
            variant={screen === s.key ? 'primary' : 'secondary'}
            onPress={() => setScreen(s.key)}
            testID={`dev-vault-wave-d-tab-${s.key}`}
          />
        ))}
        <Button
          title={language === 'en' ? 'VI' : 'EN'}
          variant="secondary"
          onPress={() => setAppLanguage(language === 'en' ? 'vi' : 'en')}
        />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </View>

      <QueryClientProvider client={client}>
        <View style={styles.body}>
          {screen === 'review' ? (
            <TripEndReviewScreen
              tripId={TRIP_ID}
              myUserId={MY_USER_ID}
              onApproved={() => undefined}
              onDenied={() => undefined}
              onBack={() => undefined}
            />
          ) : screen === 'waiting' ? (
            <TripEndWaitingScreen
              tripId={TRIP_ID}
              onBack={() => undefined}
              onAllApproved={() => undefined}
              onDenied={() => undefined}
            />
          ) : screen === 'denied' ? (
            <TripEndDeniedScreen request={DENIED_REQUEST} onDismiss={() => undefined} />
          ) : (
            <VaultSettlementScreen
              tripId={TRIP_ID}
              totalSpent={TOTAL_SPENT_VND}
              currency={CURRENCIES.VND}
              members={[]}
              myUserId={MY_USER_ID}
            />
          )}
        </View>
      </QueryClientProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  body: { flex: 1 },
});
