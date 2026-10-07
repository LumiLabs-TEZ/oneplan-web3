/**
 * Trip detail route group — wraps the detail screen and its expense routes in
 * `TripDetailProvider` so they share one tripId-keyed data set (`TripDetailView.swift`).
 */
import { Stack, useLocalSearchParams } from 'expo-router';

import { useTrips } from '@/features/trip/api/queries';
import { partitionTrips } from '@/features/trip/helpers/partitionTrips';
import { TripDetailProvider } from '@/features/trip/TripDetailContext';
import { useWeb3Enabled } from '@/features/vault/web3Flag';
import { colors } from '@/ui/theme';

export default function TripDetailLayout() {
  const { tripId: raw } = useLocalSearchParams<{ tripId: string }>();
  const tripId = Number(raw);
  const trips = useTrips();
  const isOngoing = partitionTrips(trips.data ?? []).ongoing?.id === tripId;
  const web3Enabled = useWeb3Enabled();

  return (
    <TripDetailProvider tripId={tripId} isOngoing={isOngoing}>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="invite" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="expense/scan"
          options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
        />
        <Stack.Screen name="expense/new" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="expense/[expenseId]/index" />
        <Stack.Screen name="expense/[expenseId]/edit" />
        <Stack.Screen name="budget/new" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="budget/index" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="budget/[budgetId]/edit" />
        <Stack.Screen name="plan/day-map" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="plan/new" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="plan/location" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="plan/[itemId]/index" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="plan/[itemId]/edit" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="end" options={{ animation: 'slide_from_right' }} />
        {/* Web3 vault routes: with the flag off (always, in prod) these do not exist, so a stale
            or hand-typed `oneplan://` link cannot open vault UI (final-review M2). */}
        <Stack.Protected guard={web3Enabled}>
          <Stack.Screen name="end-review" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="end-waiting" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="end-denied" options={{ animation: 'slide_from_right' }} />
          {/* VaultScanQRView / VaultDepositResultView are `.fullScreenCover`s on iOS. */}
          <Stack.Screen
            name="vault/pay"
            options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
          />
          <Stack.Screen name="vault/deposit-result" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen
            name="vault/transaction/[transactionId]"
            options={{ presentation: 'fullScreenModal' }}
          />
        </Stack.Protected>
      </Stack>
    </TripDetailProvider>
  );
}
