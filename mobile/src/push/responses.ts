import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { track } from '@/analytics/track';
import { useAuthStore } from '@/auth/authStore';
import { hrefForLink } from '@/links/href';
import type { Link, PushOpen } from '@/links/link';
import { pendingLinkStore } from '@/links/pendingLinkStore';

import { parsePushPayload } from './payload';

export interface RouteContext {
  /** Router mounted and auth hydrated (root layout past the splash). */
  ready: boolean;
  authed: boolean;
}

export interface RouteDecision {
  navigate?: Link;
  store?: Link;
}

/**
 * Pure routing decision for a tapped push. Navigates whenever the link's
 * screen exists (`hrefForLink`) and the app can render it (ready + authed);
 * everything else is parked in `pendingLinkStore` for the screen — or the
 * resolver — that will eventually own it.
 */
export function routeForPushOpen(open: PushOpen, ctx: RouteContext): RouteDecision {
  const { link } = open;
  if (!link) return {};
  if (ctx.ready && ctx.authed && hrefForLink(link)) return { navigate: link };
  return { store: link };
}

function isDefaultAction(response: Notifications.NotificationResponse): boolean {
  const defaultId: string | undefined = Notifications.DEFAULT_ACTION_IDENTIFIER;
  return !defaultId || response.actionIdentifier === defaultId;
}

/**
 * Wire push taps to navigation. Mount once in the root layout. Handles the
 * cold-start response (`getLastNotificationResponseAsync`) plus live taps, and
 * dedupes by notification identifier (both paths can report the same tap).
 */
export function usePushResponseRouter(opts: { ready: boolean }): void {
  const authed = useAuthStore((s) => s.status === 'authed');
  const ctxRef = useRef<RouteContext>({ ready: opts.ready, authed });
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    ctxRef.current = { ready: opts.ready, authed };
  }, [opts.ready, authed]);

  useEffect(() => {
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response || !isDefaultAction(response)) return;
      const id = response.notification.request.identifier;
      if (handledRef.current.has(id)) return;
      handledRef.current.add(id);

      const open = parsePushPayload(response.notification.request.content.data);
      if (open.engagementType) track('ENGAGEMENT_PUSH_OPENED', { type: open.engagementType });

      const decision = routeForPushOpen(open, ctxRef.current);
      if (decision.navigate) {
        const href = hrefForLink(decision.navigate);
        if (href) router.push(href);
        else pendingLinkStore.set(decision.navigate);
      } else if (decision.store) {
        pendingLinkStore.set(decision.store);
      }
    };

    void Notifications.getLastNotificationResponseAsync().then(handle, () => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);
}
