/**
 * Pure navigation-state derivation for the 3 end-trip consensus screens — port of the routing
 * iOS makes inline (`TripEndReviewView.vote`, `TripEndWaitingView.refresh`,
 * `requestVaultEndConsensus -> myDecision == nil` at the entry point). Kept separate from the
 * screens so the approve/deny/unanimous/partial transitions are unit-testable without rendering.
 */
import type { TripEndRequestDto, TripEndVoteDecision } from '@/features/vault/api/endTrip';

export type ConsensusScreen = 'review' | 'waiting' | 'denied' | 'ended';

/**
 * Where a member should land given the current request state (used on entry, and to guard a
 * Review screen someone re-opens after already voting).
 */
export function resolveConsensusScreen(request: TripEndRequestDto | null): ConsensusScreen {
  if (!request) return 'review';
  switch (request.status) {
    case 'PENDING':
      return request.myDecision == null ? 'review' : 'waiting';
    case 'APPROVED':
      return 'ended';
    case 'DENIED':
      return 'denied';
    case 'CANCELLED':
    default:
      return 'review';
  }
}

/**
 * Where to navigate right after casting a vote. A deny always ends the request immediately
 * (server flips status to DENIED synchronously); an approve either completes the request
 * (unanimous — server has already flipped the trip to ENDED) or leaves it pending other members.
 */
export function outcomeAfterVote(
  decision: TripEndVoteDecision,
  result: TripEndRequestDto,
): ConsensusScreen {
  if (decision === 'DENIED' || result.status === 'DENIED') return 'denied';
  if (result.status === 'APPROVED') return 'ended';
  return 'waiting';
}

/** Where a realtime `tripEndRequestUpdated` nudge (or a manual re-check) should route the Waiting screen. */
export function outcomeAfterRequestUpdate(request: TripEndRequestDto): ConsensusScreen | null {
  if (request.status === 'APPROVED') return 'ended';
  if (request.status === 'DENIED') return 'denied';
  return null;
}

/**
 * Parses the `request` route param the Review/Waiting screens hand the Denied screen (same
 * JSON-route-param pattern as `settlementModel.parseLeaveSettlement`). Validates the shape rather
 * than trusting the JSON — a malformed/stale param must degrade to "no request" instead of
 * crashing the Denied screen.
 */
export function parseTripEndRequest(raw: string | undefined | null): TripEndRequestDto | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const dto = parsed as Partial<TripEndRequestDto>;
  if (typeof dto.id !== 'number' || typeof dto.tripId !== 'number') return null;
  if (typeof dto.status !== 'string' || !Array.isArray(dto.members)) return null;
  return dto as TripEndRequestDto;
}
