import { fetch as expoFetch } from 'expo/fetch';
import { buildHeaders } from '@/api/headers';
import { refreshOnce, handleAuthExpired } from '@/api/refresh';
import { queryClient } from '@/api/queryClient';
import { keys } from '@/api/keys';
import { env } from '@/lib/env';
import { fetchActiveExtraction, fetchExtraction } from '@/features/board/api/queries';
import { startExtraction, cancelExtraction } from '@/features/board/api/mutations';
import { PinExtractionClient } from './PinExtractionClient';
import { enrichPin } from '@/features/board/helpers/enrichPin';

/** Streaming must bypass the JSON client's response-buffering 401 replay. */
export async function openExtractionStream(id: string, signal: AbortSignal): Promise<Response> {
  const url = `${env.apiUrl}/board/pins/extract/${encodeURIComponent(id)}/stream`;
  const request = () =>
    expoFetch(url, {
      headers: { ...buildHeaders(), accept: 'text/event-stream' },
      signal,
    }) as unknown as Promise<Response>;
  let response = await request();
  if (response.status === 401 && !signal.aborted) {
    await response.body?.cancel();
    if (await refreshOnce(env.apiUrl, expoFetch as unknown as typeof fetch))
      response = await request();
    else handleAuthExpired();
    if (response.status === 401) handleAuthExpired();
  }
  return response;
}
export const extractionService = new PinExtractionClient({
  start: startExtraction,
  active: fetchActiveExtraction,
  snapshot: fetchExtraction,
  cancel: cancelExtraction,
  stream: openExtractionStream,
  enrich: enrichPin,
  creditsChanged: () => {
    void queryClient.invalidateQueries({ queryKey: keys.scanCredits.balance });
  },
});
