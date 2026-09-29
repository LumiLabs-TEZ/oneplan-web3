import { ApiMutationError } from '@/api/mutationError';

import { ongoingConflictFromError } from './joinConflict';

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
