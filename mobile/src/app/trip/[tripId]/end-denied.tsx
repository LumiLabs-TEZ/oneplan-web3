/**
 * Route wrapper for `TripEndDeniedScreen`. The `request` param carries the full
 * `TripEndRequestDto` (Review's vote result or Waiting's realtime re-fetch) so this screen never
 * needs its own fetch just to show the member vote list.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { parseTripEndRequest } from '@/features/vault/helpers/tripEndConsensus';
import { TripEndDeniedScreen } from '@/features/vault/screens/TripEndDeniedScreen';
import { Spinner } from '@/ui/components';

export default function TripEndDeniedRoute() {
  const { tripId: raw, request: rawRequest } = useLocalSearchParams<{
    tripId: string;
    request?: string;
  }>();
  const request = parseTripEndRequest(rawRequest);

  const dismiss = () =>
    router.dismissTo({ pathname: '/trip/[tripId]', params: { tripId: raw } });

  useEffect(() => {
    // A stale/malformed param (e.g. a deep link into this route directly) — nothing useful to
    // show, so bounce back to the trip rather than rendering a broken member list.
    if (!request) dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (!request) return <Spinner fill />;
  return <TripEndDeniedScreen request={request} onDismiss={dismiss} />;
}
