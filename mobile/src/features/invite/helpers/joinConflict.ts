/**
 * `POST /trips/join/{code}` 409 body (`server/src/trips/trips.service.ts:687-696`):
 * `{ statusCode: 409, error: 'ONGOING_TRIP_CONFLICT', message, existingTripName }`.
 * Nest puts the discriminator in `error`; we also accept `code` so a future
 * `{ code: … }` shape (used by other OnePlan error DTOs) keeps working.
 */
import { ApiMutationError } from '@/api/mutationError';

export const ONGOING_TRIP_CONFLICT = 'ONGOING_TRIP_CONFLICT';

interface ConflictBody {
  error?: unknown;
  code?: unknown;
  existingTripName?: unknown;
}

/** `{ existingTripName }` when `err` is the ongoing-trip 409, else `null`. */
export function ongoingConflictFromError(err: unknown): { existingTripName: string } | null {
  if (!(err instanceof ApiMutationError) || err.status !== 409) return null;
  const body = (err.body ?? null) as ConflictBody | null;
  if (!body || typeof body !== 'object') return null;
  if (body.error !== ONGOING_TRIP_CONFLICT && body.code !== ONGOING_TRIP_CONFLICT) return null;
  return {
    existingTripName: typeof body.existingTripName === 'string' ? body.existingTripName : '',
  };
}

export const WEB3_UNAVAILABLE = 'web3_unavailable';

/** True for the 403 `{ code: 'web3_unavailable' }` a web3 trip answers to a non-eligible region. */
export function isWeb3UnavailableError(err: unknown): boolean {
  if (!(err instanceof ApiMutationError) || err.status !== 403) return false;
  const body = (err.body ?? null) as { code?: unknown } | null;
  return typeof body === 'object' && body !== null && body.code === WEB3_UNAVAILABLE;
}
