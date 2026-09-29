import { router, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useAuthStore } from '@/auth/authStore';

import { hrefForLink } from './href';
import type { Link } from './link';
import { pendingLinkStore, usePendingLinkStore } from './pendingLinkStore';

export type LinkResolution = { navigate: Href } | { keep: true } | { drop: true };

/**
 * Pure resolution for a parked link. `navigate` when its screen exists
 * (`hrefForLink`) and the app is ready + authenticated; otherwise `keep` it
 * parked — either the screen doesn't exist yet (Phase 4/5/7 kinds) or the
 * app isn't ready to navigate yet (cold start / logged out). Never `drop`s —
 * unresolved links stay parked for a later phase or a later ready/authed
 * change; `drop` is part of the return type for future callers that do want
 * to discard a link (e.g. an expired/one-shot kind).
 */
export function resolvePendingLink(
  link: Link | null,
  ctx: { ready: boolean; authed: boolean; onAuthedRoute?: boolean },
): LinkResolution {
  if (!link) return { keep: true };
  const href = hrefForLink(link);
  if (href && ctx.ready && ctx.authed && ctx.onAuthedRoute !== false) return { navigate: href };
  return { keep: true };
}

/** Root routes shown while signed out; a push issued while one of these is current is dropped. */
const UNAUTHED_PATHS = new Set(['/login', '/onboarding']);

/**
 * Drains `pendingLinkStore` into navigation. Mount once in the root layout
 * next to `usePushResponseRouter`. Re-evaluates whenever the store changes
 * (`useUrlListener` / a push tap parking a new link) or `ready`/`authed`
 * flips (e.g. login completing after a cold-start deep link parked it).
 */
export function useLinkResolver(opts: { ready: boolean }): void {
  const authed = useAuthStore((s) => s.status === 'authed');
  // `ready`/`authed` flip in the same render that swaps the login stack for the protected app
  // stack; a push issued right then targets a screen the navigator hasn't registered yet and is
  // silently dropped (post-login listing link landed on Home). Wait until the current pathname
  // has left the signed-out routes, then push on the next frame so the new stack is mounted.
  const pathname = usePathname();
  const onAuthedRoute = !UNAUTHED_PATHS.has(pathname);

  useEffect(() => {
    let frame: number | undefined;
    const tryResolve = () => {
      const link = pendingLinkStore.peek();
      const resolution = resolvePendingLink(link, { ready: opts.ready, authed, onAuthedRoute });
      if ('navigate' in resolution) {
        pendingLinkStore.consume();
        frame = requestAnimationFrame(() => router.push(resolution.navigate));
      }
    };

    tryResolve();
    const unsubscribe = usePendingLinkStore.subscribe(tryResolve);
    return () => {
      unsubscribe();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [opts.ready, authed, onAuthedRoute]);
}
