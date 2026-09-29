import {
  outcomeAfterRequestUpdate,
  outcomeAfterVote,
  parseTripEndRequest,
  resolveConsensusScreen,
} from './tripEndConsensus';
import type { TripEndRequestDto } from '../api/endTrip';

function request(overrides: Partial<TripEndRequestDto> = {}): TripEndRequestDto {
  return {
    id: 1,
    tripId: 10,
    requestedBy: 1,
    status: 'PENDING',
    createdAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: null,
    myDecision: null,
    approvedCount: 0,
    memberCount: 3,
    members: [],
    ...overrides,
  };
}

describe('resolveConsensusScreen', () => {
  it('routes to review when there is no request yet', () => {
    expect(resolveConsensusScreen(null)).toBe('review');
  });

  it('routes to review when pending and the caller has not voted', () => {
    expect(resolveConsensusScreen(request({ status: 'PENDING', myDecision: null }))).toBe(
      'review',
    );
  });

  it('routes to waiting when pending and the caller already approved (partial)', () => {
    expect(resolveConsensusScreen(request({ status: 'PENDING', myDecision: 'APPROVED' }))).toBe(
      'waiting',
    );
  });

  it('routes to ended once the request is unanimously approved', () => {
    expect(resolveConsensusScreen(request({ status: 'APPROVED', myDecision: 'APPROVED' }))).toBe(
      'ended',
    );
  });

  it('routes to denied once any member denies', () => {
    expect(resolveConsensusScreen(request({ status: 'DENIED', myDecision: 'APPROVED' }))).toBe(
      'denied',
    );
  });

  it('treats a cancelled request like no request (back to review)', () => {
    expect(resolveConsensusScreen(request({ status: 'CANCELLED' }))).toBe('review');
  });
});

describe('outcomeAfterVote', () => {
  it('a deny vote always lands on denied, even if the server has not flipped status yet', () => {
    expect(outcomeAfterVote('DENIED', request({ status: 'PENDING' }))).toBe('denied');
  });

  it('an approve vote that leaves other members pending (partial) lands on waiting', () => {
    expect(
      outcomeAfterVote('APPROVED', request({ status: 'PENDING', approvedCount: 1, memberCount: 3 })),
    ).toBe('waiting');
  });

  it('the last approve vote (unanimous) lands on ended', () => {
    expect(
      outcomeAfterVote(
        'APPROVED',
        request({ status: 'APPROVED', approvedCount: 3, memberCount: 3 }),
      ),
    ).toBe('ended');
  });

  it('defers to the server status over the local decision when they disagree', () => {
    // Defensive case: caller voted APPROVED but the server reports DENIED (e.g. a concurrent
    // deny raced this vote) — the server status wins.
    expect(outcomeAfterVote('APPROVED', request({ status: 'DENIED' }))).toBe('denied');
  });
});

describe('outcomeAfterRequestUpdate', () => {
  it('returns null while still pending — the Waiting screen keeps waiting', () => {
    expect(outcomeAfterRequestUpdate(request({ status: 'PENDING' }))).toBeNull();
  });

  it('routes to ended on the realtime nudge that reports unanimous approval', () => {
    expect(outcomeAfterRequestUpdate(request({ status: 'APPROVED' }))).toBe('ended');
  });

  it('routes to denied on the realtime nudge that reports a deny', () => {
    expect(outcomeAfterRequestUpdate(request({ status: 'DENIED' }))).toBe('denied');
  });
});

describe('parseTripEndRequest', () => {
  it('round-trips a JSON.stringify(request) route param', () => {
    const original = request({ status: 'DENIED' });
    expect(parseTripEndRequest(JSON.stringify(original))).toEqual(original);
  });

  it('returns null for undefined/empty input', () => {
    expect(parseTripEndRequest(undefined)).toBeNull();
    expect(parseTripEndRequest(null)).toBeNull();
    expect(parseTripEndRequest('')).toBeNull();
  });

  it('returns null for malformed JSON instead of throwing', () => {
    expect(parseTripEndRequest('{not json')).toBeNull();
  });

  it('returns null when required fields are missing (stale/malformed shape)', () => {
    expect(parseTripEndRequest(JSON.stringify({ id: 1 }))).toBeNull();
    expect(parseTripEndRequest(JSON.stringify({ tripId: 1, status: 'DENIED' }))).toBeNull();
  });
});
