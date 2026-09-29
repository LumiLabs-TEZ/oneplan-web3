/** Route wrapper for `TripEndWaitingScreen` — navigation only. */
import { router, useLocalSearchParams } from 'expo-router';

import { TripEndWaitingScreen } from '@/features/vault/screens/TripEndWaitingScreen';

export default function TripEndWaitingRoute() {
  const { tripId: raw } = useLocalSearchParams<{ tripId: string }>();
  const tripId = Number(raw);

  return (
    <TripEndWaitingScreen
      tripId={tripId}
      onBack={() => router.back()}
      onAllApproved={() =>
        router.replace({ pathname: '/trip/[tripId]/end', params: { tripId: raw, mode: 'flow' } })
      }
      onDenied={(request) =>
        router.replace({
          pathname: '/trip/[tripId]/end-denied',
          params: { tripId: raw, request: JSON.stringify(request) },
        })
      }
    />
  );
}
