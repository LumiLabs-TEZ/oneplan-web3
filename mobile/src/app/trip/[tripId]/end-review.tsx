/**
 * Route wrapper for `TripEndReviewScreen` — navigation only, no presentation logic.
 * Entry point: `TripMenuController.confirmEndTrip` (vault trips) and, later, Wave E's
 * "Waiting for approval" CTA on `TripVaultCard` when the caller hasn't voted yet.
 */
import { router, useLocalSearchParams } from 'expo-router';

import { useMe } from '@/features/me/useMe';
import { useTripDetail } from '@/features/trip/TripDetailContext';
import { TripEndReviewScreen } from '@/features/vault/screens/TripEndReviewScreen';

export default function TripEndReviewRoute() {
  const { tripId: raw } = useLocalSearchParams<{ tripId: string }>();
  const tripId = Number(raw);
  const detail = useTripDetail();
  const me = useMe();

  return (
    <TripEndReviewScreen
      tripId={tripId}
      myUserId={me.data?.id}
      coverImageUrl={detail.trip?.coverImageUrl}
      onBack={() => router.back()}
      onApproved={(request) => {
        // `onApproved` fires for both the unanimous last vote (server already flipped the trip to
        // ENDED) and a partial approve still waiting on other members — the status tells them apart.
        if (request.status === 'APPROVED') {
          router.replace({ pathname: '/trip/[tripId]/end', params: { tripId: raw, mode: 'flow' } });
        } else {
          router.replace({ pathname: '/trip/[tripId]/end-waiting', params: { tripId: raw } });
        }
      }}
      onDenied={(request) =>
        router.replace({
          pathname: '/trip/[tripId]/end-denied',
          params: { tripId: raw, request: JSON.stringify(request) },
        })
      }
    />
  );
}
