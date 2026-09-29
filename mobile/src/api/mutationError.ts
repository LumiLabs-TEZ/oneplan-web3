/**
 * Shared mutation error for feature `api/mutations.ts` modules (trip, budget, …).
 * Carries the raw HTTP status + body (so callers can read structured fields like
 * `StartTripConflictErrorDto.memberNames`) alongside the classified message.
 */
import { classifyError, type ClassifiedError } from './errors';

export class ApiMutationError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly classified: ClassifiedError;

  constructor(status: number, body: unknown) {
    const classified = classifyError(body, { status });
    super(classified.message);
    this.name = 'ApiMutationError';
    this.status = status;
    this.body = body;
    this.classified = classified;
  }
}

/** User-facing message for any thrown mutation error. */
export function mutationErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiMutationError) return err.classified.message || fallback;
  return classifyError(err).message || fallback;
}
