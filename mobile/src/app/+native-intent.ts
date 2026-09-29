import { getShareExtensionKey } from 'expo-share-intent';

import { useAuthStore } from '@/auth/authStore';
import { env } from '@/lib/env';
import { isKnownLinkPath, parseUrlToLink } from '@/links/parseUrl';
import { pendingLinkStore } from '@/links/pendingLinkStore';

/**
 * expo-router hook for incoming native URLs (`redirectSystemPath` — must
 * return a path, and any path returned navigates there). The share extension
 * hands over a `oneplan://dataUrl=...` link; route it to the app root so
 * `useShareIntent` can pick it up instead of expo-router 404-ing on an
 * unknown path.
 *
 * Everything else is run through `parseUrlToLink`: an unrecognized URL
 * (Google's reverse-client-id OAuth callback, junk) is returned unchanged so
 * expo-router's own resolution/404 handles it — except a malformed link on a
 * known link path (`listing/0`), which is swallowed (`/` cold, `/_parked` warm).
 *
 * A recognized link is either navigated to directly OR parked in
 * `pendingLinkStore` — never both (parking it as well as returning its path
 * would double-navigate: expo-router navigates on the returned path, and
 * `useLinkResolver` would also `router.push` the same href off the parked
 * link). Mirrors `routeForPushOpen`'s ready/authed gate:
 *  - `tripInvite`, already authed: route straight to `/join/{code}`, nothing
 *    parked.
 *  - `tripInvite`, not authed: park it (no screen to navigate to yet —
 *    `Stack.Protected` would drop `/join` for a logged-out user) and land on
 *    `/` (cold) / `/_parked` (warm); `useLinkResolver` replays it after login.
 *  - every other kind: parked + `/`/`/_parked`. `friendInvite` now has a screen
 *    (`/friend/[code]`, M3.4), so the parked link is replayed by `useLinkResolver`
 *    as soon as the app is ready + authed instead of waiting for a later phase;
 *    `listing` / `missions` remain parked for their owning phases.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      return initial ? '/' : '/_parked';
    }

    const link = parseUrlToLink(path, env.linkHosts);
    if (link === null) {
      // A malformed OnePlan link (`oneplan://listing/0`) has no screen: stay put rather than let
      // expo-router resolve `/listing/0` to its "Unmatched Route" page.
      if (isKnownLinkPath(path, env.linkHosts)) return initial ? '/' : '/_parked';
      return path;
    }

    if (link.kind === 'tripInvite' && useAuthStore.getState().status === 'authed') {
      return `/join/${link.inviteCode}`;
    }

    pendingLinkStore.set(link);
    return initial ? '/' : '/_parked';
  } catch {
    return '/';
  }
}
