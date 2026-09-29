/**
 * In-app destinations a push tap or deep link can resolve to. Mirrors the
 * iOS `DeepLinkRouter.queue*` targets (NotificationDelegate.swift). Phase 1
 * only navigates `trip`; every other kind is parked in `pendingLinkStore`
 * until the owning screen lands (Phase 2+).
 */
export type Link =
  | { kind: 'trip'; tripId: number; planItemId?: number; refreshPlan?: boolean }
  | { kind: 'tripInvite'; inviteCode: string }
  | { kind: 'friendInvite'; friendCode: string }
  | { kind: 'friendRequest' }
  | { kind: 'listing'; listingId: number | string }
  | { kind: 'market' }
  | { kind: 'board' }
  | { kind: 'pinExtractUrl'; sourceUrl: string }
  | { kind: 'pinExtraction'; sessionId: string }
  | { kind: 'missions' };

export type LinkKind = Link['kind'];

/** Result of parsing a push payload: where to go, plus the engagement type to track (if any). */
export interface PushOpen {
  link: Link | null;
  /** Set for `engagement_*` pushes (server ENGAGEMENT_PUSH_TYPE map) → `ENGAGEMENT_PUSH_OPENED`. */
  engagementType?: string;
}
