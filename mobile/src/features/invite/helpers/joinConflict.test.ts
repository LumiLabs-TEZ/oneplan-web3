import { ApiMutationError } from '@/api/mutationError';

import { isWeb3UnavailableError, ongoingConflictFromError } from './joinConflict';

/** The exact body NestJS sends from `TripsService.joinTrip`. */
const serverBody = {
  statusCode: 409,
  error: 'ONGOING_TRIP_CONFLICT',
  message: 'You already have an ongoing trip: "Da Lat"',
  existingTripName: 'Da Lat',
};

describe('ongoingConflictFromError', () => {
  it('reads `error` from the real 409 body', () => {
    expect(ongoingConflictFromError(new ApiMutationError(409, serverBody))).toEqual({
      existingTripName: 'Da Lat',
    });
  });

  it('also accepts a `code` discriminator', () => {
    const err = new ApiMutationError(409, {
      code: 'ONGOING_TRIP_CONFLICT',
      existingTripName: 'Hue',
    });
    expect(ongoingConflictFromError(err)).toEqual({ existingTripName: 'Hue' });
  });

  it('falls back to an empty name when the server omits it', () => {
    const err = new ApiMutationError(409, { statusCode: 409, error: 'ONGOING_TRIP_CONFLICT' });
    expect(ongoingConflictFromError(err)).toEqual({ existingTripName: '' });
  });

  it('returns null for other 409s, other statuses and non-API errors', () => {
    expect(
      ongoingConflictFromError(new ApiMutationError(409, { error: 'ALREADY_MEMBER' })),
    ).toBeNull();
    expect(ongoingConflictFromError(new ApiMutationError(400, serverBody))).toBeNull();
    expect(ongoingConflictFromError(new ApiMutationError(409, null))).toBeNull();
    expect(ongoingConflictFromError(new Error('offline'))).toBeNull();
  });
});

describe('isWeb3UnavailableError', () => {
  const body = { code: 'web3_unavailable', message: 'Web3 features are not available here' };

  it('matches the 403 a web3 trip answers to a non-eligible region', () => {
    expect(isWeb3UnavailableError(new ApiMutationError(403, body))).toBe(true);
  });

  it('ignores other 403s, other statuses and non-API errors', () => {
    expect(isWeb3UnavailableError(new ApiMutationError(403, { message: 'nope' }))).toBe(false);
    expect(isWeb3UnavailableError(new ApiMutationError(409, body))).toBe(false);
    expect(isWeb3UnavailableError(new Error('offline'))).toBe(false);
  });
});
