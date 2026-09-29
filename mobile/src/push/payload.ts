import type { Link, PushOpen } from '@/links/link';

/**
 * Pure push-payload → destination parser. Port of the `type` routing table in
 * ios/OnePlan/OnePlan/NotificationDelegate.swift (didReceive response) and the
 * `NotificationPayloadParser` id coercion rules (positive integers; numbers or
 * numeric strings — Android FCM data messages are all strings, see
 * android/.../PushPayloadParser.kt).
 */

type DataMap = Record<string, unknown>;

function isObject(v: unknown): v is DataMap {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseJsonObject(v: unknown): DataMap | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(s);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Normalise the shapes expo-notifications hands us into one flat map:
 *  - iOS: `content.data` is the APNs userInfo (flat)
 *  - Android data-only FCM: `{ data: {...} }`, or the map itself, or the data
 *    payload JSON-encoded under `body` (older expo-notifications versions)
 * Nested values win over the outer wrapper's keys.
 */
export function extractData(raw: unknown): DataMap {
  if (!isObject(raw)) return {};
  const nested = isObject(raw.data)
    ? raw.data
    : isObject(raw.body)
      ? raw.body
      : (parseJsonObject(raw.body) ?? parseJsonObject(raw.data));
  return nested ? { ...raw, ...nested } : { ...raw };
}

/** `NotificationPayloadParser.parse*Id`: positive integer from a number or a numeric string. */
export function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\+?\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  return null;
}

function parseNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const NONE: PushOpen = { link: null };

function listingOrMarket(data: DataMap): Link {
  const listingId = parsePositiveInt(data.listingId);
  return listingId ? { kind: 'listing', listingId } : { kind: 'market' };
}

function tripLink(data: DataMap, extra?: Partial<Extract<Link, { kind: 'trip' }>>): Link | null {
  const tripId = parsePositiveInt(data.tripId);
  return tripId ? { kind: 'trip', tripId, ...extra } : null;
}

export function parsePushPayload(raw: unknown): PushOpen {
  const data = extractData(raw);
  if (Object.keys(data).length === 0) return NONE;
  const type = typeof data.type === 'string' ? data.type : null;

  switch (type) {
    case 'trip_invite': {
      const inviteCode = parseNonEmptyString(data.inviteCode);
      return { link: inviteCode ? { kind: 'tripInvite', inviteCode } : null };
    }
    case 'friend_request':
      return { link: { kind: 'friendRequest' } };
    case 'listing_approved':
    case 'listing_rejected': {
      const listingId = parsePositiveInt(data.listingId);
      return { link: listingId ? { kind: 'listing', listingId } : null };
    }
    case 'trip_request_fulfilled':
      // Older pushes without a listingId just land on the Market tab.
      return { link: listingOrMarket(data) };
    case 'pin_extraction_completed': {
      const sessionId = parseNonEmptyString(data.sessionId);
      return { link: sessionId ? { kind: 'pinExtraction', sessionId } : null };
    }
    case 'mission_completed':
      return { link: { kind: 'missions' } };
    case 'admin_broadcast': {
      switch (data.destination) {
        case 'board':
          return { link: { kind: 'board' } };
        case 'market':
          return { link: listingOrMarket(data) };
        default:
          return NONE; // no destination → just open the app
      }
    }
    default:
      break;
  }

  if (type?.startsWith('engagement_')) {
    const open: PushOpen = { link: null, engagementType: type };
    switch (type) {
      case 'engagement_new_plan':
        open.link = listingOrMarket(data);
        break;
      case 'engagement_dormant':
        open.link = { kind: 'board' };
        break;
      case 'engagement_weather':
        open.link = tripLink(data);
        break;
      case 'engagement_unfinished_plan':
        // Land in the Your Plan tab (iOS queues a plan refresh alongside the trip).
        open.link = tripLink(data, { refreshPlan: true });
        break;
      default:
        break; // unknown engagement variant → record the open, no navigation
    }
    return open;
  }

  // Everything below is trip-scoped; an invalid/missing tripId is ignored.
  const tripId = parsePositiveInt(data.tripId);
  if (!tripId) return NONE;

  switch (type) {
    case 'plan_reminder': {
      const planItemId = parsePositiveInt(data.planItemId);
      return { link: planItemId ? { kind: 'trip', tripId, planItemId } : { kind: 'trip', tripId } };
    }
    case 'member_left':
    case 'member_joined':
    default:
      // Unknown (or newer) trip-scoped type → land on the trip, not the chat.
      return { link: { kind: 'trip', tripId } };
  }
}
