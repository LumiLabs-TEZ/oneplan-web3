import * as Linking from 'expo-linking';
import { getShareExtensionKey } from 'expo-share-intent';
import { useEffect, useRef } from 'react';

import { useAuthStore } from '@/auth/authStore';
import { env } from '@/lib/env';

import { parseUrlToLink } from './parseUrl';
import { pendingLinkStore } from './pendingLinkStore';

/** `+native-intent.ts` and `Linking`'s own listener both fire for the same tap. */
const DEDUPE_WINDOW_MS = 2000;

/** The share-extension hand-off URL (`+native-intent.ts` routes it to `useShareIntent` instead). */
function isShareExtensionUrl(url: string): boolean {
  try {
    return url.includes(`dataUrl=${getShareExtensionKey()}`);
  } catch {
    return false;
  }
}

/**
 * Listens for incoming URLs — cold-start (`Linking.getInitialURL`) and live
 * taps (`Linking.addEventListener('url', ...)`) — and parks any recognized
 * deep link in `pendingLinkStore` for `useLinkResolver` to navigate. Mount
 * once in the root layout.
 *
 * An authed `tripInvite` is deliberately NOT parked — `+native-intent.ts`
 * already navigated to `/join/{code}` for it (navigate XOR park).
 */
export function useUrlListener(): void {
  const lastRef = useRef<{ url: string; at: number } | null>(null);

  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      if (!url || isShareExtensionUrl(url)) return;

      const last = lastRef.current;
      const now = Date.now();
      if (last && last.url === url && now - last.at < DEDUPE_WINDOW_MS) return;
      lastRef.current = { url, at: now };

      const link = parseUrlToLink(url, env.linkHosts);
      if (!link) return;
      // `+native-intent.ts` navigates XOR parks: an authed `tripInvite` was
      // already routed to `/join/{code}` there, so parking it here too would
      // make `useLinkResolver` push a second copy of the same screen.
      if (link.kind === 'tripInvite' && useAuthStore.getState().status === 'authed') return;
      pendingLinkStore.set(link);
    };

    void Linking.getInitialURL().then(handle, () => undefined);
    const sub = Linking.addEventListener('url', (event) => handle(event.url));
    return () => sub.remove();
  }, []);
}
