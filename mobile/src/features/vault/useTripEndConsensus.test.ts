import type { TripEndRequestDto } from './api/endTrip';
import { consensusAutoRoute } from './useTripEndConsensus';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const ME = 2;
const HOST = 1;

function request(overrides: Partial<TripEndRequestDto> = {}): TripEndRequestDto {
  return {
    id: 10,
    tripId: 7,
    requestedBy: HOST,
    status: 'PENDING',
    createdAt: '2026-10-03T00:00:00.000Z',
    myDecision: null,
    approvedCount: 1,
    memberCount: 2,
    members: [],
    ...overrides,
  };
}

describe('consensusAutoRoute', () => {
  it('never routes on the first load, even mid-vote', () => {
    expect(consensusAutoRoute(undefined, request(), ME)).toBeNull();
  });

  it("opens Review when someone else's request appears and I haven't voted", () => {
    expect(consensusAutoRoute(null, request(), ME)).toBe('review');
    expect(consensusAutoRoute(request({ status: 'DENIED' }), request({ id: 11 }), ME)).toBe(
      'review',
    );
  });

  it('leaves the requester alone (the menu already opened Review)', () => {
    expect(consensusAutoRoute(null, request({ requestedBy: ME }), ME)).toBeNull();
  });

  it('does not reopen Review once I have voted, or for a vote count change', () => {
    expect(consensusAutoRoute(null, request({ myDecision: 'APPROVED' }), ME)).toBeNull();
    expect(consensusAutoRoute(request(), request({ approvedCount: 2 }), ME)).toBeNull();
  });

  it('opens Denied when a pending request is denied', () => {
    expect(consensusAutoRoute(request(), request({ status: 'DENIED' }), ME)).toBe('denied');
  });

  it('leaves APPROVED to the tripEnded handler', () => {
    expect(consensusAutoRoute(request(), request({ status: 'APPROVED' }), ME)).toBeNull();
  });
});
