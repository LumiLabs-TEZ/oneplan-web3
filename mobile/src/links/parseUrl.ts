import {
  BOARD_EXTRACT_SEGMENT,
  BOARD_PATH,
  CUSTOM_SCHEME,
  FRIEND_PATH,
  JOIN_PATH,
  LISTING_PATH,
} from './deepLinkBuilder';
import type { Link } from './link';

/**
 * Defense-in-depth: deep-link payloads come from outside the app (phishing
 * links, crafted QR codes). Restrict codes to a small alphanumeric charset
 * within a reasonable length window before any routing decision. Mirrors
 * `isValidDeepLinkCode` (OnePlanApp.swift:503-630) / Android
 * `DeepLinkUrlParser.isValidDeepLinkCode`.
 */
export const DEEP_LINK_CODE = /^[A-Za-z0-9_-]{6,64}$/;

function decodeSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function decodeCode(raw: string | undefined): string | null {
  if (!raw) return null;
  const decoded = decodeSegment(raw);
  return decoded && DEEP_LINK_CODE.test(decoded) ? decoded : null;
}

/**
 * Splits `input` into path segments, resolving which "host" claimed it:
 *  - bare path (`/join/ABC123`, what expo-router hands `redirectSystemPath`)
 *  - custom scheme (`oneplan://join/ABC123` — the "host" component IS the
 *    first path segment in this scheme)
 *  - universal https URL whose host is in `hosts` (case-insensitive)
 * Anything else (unknown https host, an unrelated scheme like the Google
 * reverse-client-id OAuth callback, or an unparseable string) returns `null`.
 */
function segmentsOf(input: string, hosts: readonly string[]): string[] | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/')) {
    return trimmed.split(/[?#]/)[0]!.split('/').filter(Boolean);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const scheme = url.protocol.replace(/:$/, '').toLowerCase();
  const pathSegments = url.pathname.split('/').filter(Boolean);

  if (scheme === CUSTOM_SCHEME) {
    const host = url.hostname.toLowerCase();
    return host ? [host, ...pathSegments] : pathSegments;
  }

  const host = url.hostname.toLowerCase();
  if (host && hosts.some((h) => h.toLowerCase() === host)) return pathSegments;
  return null;
}

/**
 * Parses an incoming URL/path into a `Link`, or `null` if it isn't a
 * recognized OnePlan deep link. Accepts full custom-scheme URLs
 * (`oneplan://join/ABC123`), full https URLs whose host is in `hosts`
 * (`https://op.oneplan.space/join/ABC123`), and bare paths (`/join/ABC123`).
 * The first path segment is matched case-insensitively (Android
 * `DeepLinkUrlParser` parity); codes are percent-decoded before validation.
 * Mirrors `handleIncomingURL` / `extractCode` / `parseListingId`
 * (OnePlanApp.swift:503-630).
 */
export function parseUrlToLink(input: string, hosts: readonly string[]): Link | null {
  const segments = segmentsOf(input, hosts);
  if (!segments || segments.length === 0) return null;

  const [first, ...rest] = segments;
  const kind = first!.toLowerCase();

  switch (kind) {
    case JOIN_PATH: {
      const code = decodeCode(rest[0]);
      return code ? { kind: 'tripInvite', inviteCode: code } : null;
    }
    case FRIEND_PATH: {
      const code = decodeCode(rest[0]);
      return code ? { kind: 'friendInvite', friendCode: code } : null;
    }
    case LISTING_PATH: {
      const raw = rest[0] ? decodeSegment(rest[0]) : null;
      if (!raw) return null;
      if (/^\d+$/.test(raw)) {
        const listingId = Number(raw);
        return Number.isSafeInteger(listingId) && listingId > 0
          ? { kind: 'listing', listingId }
          : null;
      }
      return DEEP_LINK_CODE.test(raw) ? { kind: 'listing', listingId: raw } : null;
    }
    case BOARD_PATH: {
      const segment = rest[0]?.toLowerCase();
      return segment === BOARD_EXTRACT_SEGMENT ? { kind: 'board' } : null;
    }
    default:
      return null;
  }
}

const LINK_PATHS: readonly string[] = [JOIN_PATH, FRIEND_PATH, LISTING_PATH, BOARD_PATH];

/**
 * True when the URL/path targets one of OnePlan's deep-link paths even if the payload is invalid
 * (`oneplan://listing/0`, `/join/`), so callers can swallow it instead of letting expo-router try
 * to resolve `/listing/0` and land on its "Unmatched Route" screen.
 */
export function isKnownLinkPath(input: string, hosts: readonly string[]): boolean {
  const segments = segmentsOf(input, hosts);
  const first = segments?.[0]?.toLowerCase();
  return first !== undefined && LINK_PATHS.includes(first);
}
