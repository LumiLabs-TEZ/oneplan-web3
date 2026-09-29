/**
 * Scanned QR-code payload → app destination. Port of `ProfileView.parseInviteCode` /
 * `parseFriendCode` (ProfileView.swift:176-236) collapsed into a single result type since the
 * scanner doesn't know in advance which kind of code it will see.
 */
import { env } from '@/lib/env';

import { DEEP_LINK_CODE, parseUrlToLink } from './parseUrl';

export type ScannedCode =
  { kind: 'friend'; code: string } | { kind: 'tripInvite'; code: string } | null;

/** Case-insensitive `invitecode`/`code` query param, mirrors `parseInviteCode`'s query check. */
function queryInviteCode(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase() === 'invitecode' || key.toLowerCase() === 'code') {
      return DEEP_LINK_CODE.test(value) ? value : null;
    }
  }
  return null;
}

/**
 * Resolves a raw scanned string (custom-scheme URL, universal-link URL, query-param URL, or a
 * bare code) into a `{ kind, code }` destination, or `null` for junk. `hosts` defaults to the
 * build's universal-link hosts (`env.linkHosts`) but is overridable so tests can exercise every
 * host without re-mocking `expo-constants`.
 */
export function parseScannedCode(
  raw: string,
  hosts: readonly string[] = env.linkHosts,
): ScannedCode {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const link = parseUrlToLink(trimmed, hosts);
  if (link?.kind === 'friendInvite') return { kind: 'friend', code: link.friendCode };
  if (link?.kind === 'tripInvite') return { kind: 'tripInvite', code: link.inviteCode };

  const queryCode = queryInviteCode(trimmed);
  if (queryCode) return { kind: 'tripInvite', code: queryCode };

  if (DEEP_LINK_CODE.test(trimmed)) return { kind: 'tripInvite', code: trimmed };

  return null;
}
