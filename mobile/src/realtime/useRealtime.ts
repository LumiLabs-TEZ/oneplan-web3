import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { queryClient } from '@/api/queryClient';
import { refreshOnce } from '@/api/refresh';
import { useAuthStore } from '@/auth/authStore';
import { tokenStore } from '@/auth/tokenStore';
import { liveRequests } from '@/features/friends/presentedRequests';
import { isWeb3Enabled } from '@/features/vault/web3Flag';
import { env, webSocketUrl } from '@/lib/env';

import type { RealtimeEvent } from './envelope';
import { invalidationFor } from './invalidation';
import { RealtimeClient, type WebSocketLike } from './RealtimeClient';
import { emitInviteReceived, realtimeStore } from './realtimeStore';

/**
 * React Native's WebSocket accepts an options bag with upgrade headers — the
 * only way to authenticate against this server (it reads `Authorization` on the
 * upgrade, never a query param). Verified by the Phase 0 spike.
 */
type RNWebSocketCtor = new (
  url: string,
  protocols?: string | string[] | null,
  options?: { headers?: Record<string, string> },
) => WebSocket;

let client: RealtimeClient | null = null;

/** The client if it was ever created — never constructs one (used by sign-out). */
export function peekRealtimeClient(): RealtimeClient | null {
  return client;
}

/** Process-wide realtime client (lazy so `env` is only read when first used). */
export function realtimeClient(): RealtimeClient {
  client ??= new RealtimeClient(webSocketUrl('/realtime'), {
    makeSocket: (url, headers) =>
      new (WebSocket as unknown as RNWebSocketCtor)(url, null, {
        headers,
      }) as unknown as WebSocketLike,
    getToken: () => tokenStore.get()?.accessToken ?? null,
    refresh: async () => (await refreshOnce(env.apiUrl)) !== null,
  });
  return client;
}

/** Fan a realtime event out to the query cache and the effect stores. */
export function applyRealtimeEvent(event: RealtimeEvent): void {
  const { queryKeys, effect } = invalidationFor(event, { web3Enabled: isWeb3Enabled() });
  for (const target of queryKeys) {
    void queryClient.invalidateQueries('queryKey' in target ? target : { queryKey: target });
  }
  if (!effect) return;
  if (effect.type === 'inviteReceived') emitInviteReceived(effect.invite);
  else if (effect.type === 'friendRequestReceived') liveRequests.add(effect.requestId);
  else if (effect.type === 'tripMemberRemoved')
    realtimeStore.pushEffect({ type: 'tripMemberRemoved', tripId: effect.tripId, userId: effect.userId });
  else realtimeStore.pushEffect({ type: effect.type, tripId: effect.tripId });
}

/**
 * Mounts the realtime socket for the session (call once, from the root layout):
 * connects while authed, follows network + foreground state, and pushes every
 * event into the query cache.
 */
export function useRealtime(): void {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    const c = realtimeClient();
    const offState = c.onStateChange(realtimeStore.setState);
    const offEvent = c.onEvent(applyRealtimeEvent);
    const offOnline = onlineManager.subscribe((online) => c.setOnline(online));
    // `AppState` only reports *changes*; seed the current value so a client
    // created while the app is backgrounded does not think it is foregrounded.
    c.setForeground(AppState.currentState === 'active');
    const sub = AppState.addEventListener('change', (next: AppStateStatus) =>
      c.setForeground(next === 'active'),
    );
    return () => {
      offState();
      offEvent();
      offOnline();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const c = realtimeClient();
    if (status !== 'authed') {
      c.disconnect();
      return;
    }
    c.setOnline(onlineManager.isOnline());
    c.resetAndConnect();
  }, [status]);
}

/** Test-only. */
export function _resetRealtimeClientForTests(): void {
  client = null;
}
