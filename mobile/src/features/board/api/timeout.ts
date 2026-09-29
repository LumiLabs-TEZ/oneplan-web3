import { withTimeout } from '@/api/withTimeout';
/** Snapshot/start requests must not keep the session controller busy indefinitely. */
export function extractionRequest<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return withTimeout(request);
}
