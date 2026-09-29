import { fetch as expoFetch } from 'expo/fetch';
import createClient, { type Middleware } from 'openapi-fetch';

import { isAccessTokenExpiring, tokenStore } from '@/auth/tokenStore';
import { env } from '@/lib/env';

import { buildHeaders } from './headers';
import { handleAuthExpired, refreshOnce } from './refresh';
import type { paths } from './schema';

/** Paths that must never trigger a refresh (they *are* the auth flow). */
const NO_REFRESH_PATHS = [
  '/auth/social',
  '/auth/refresh',
  '/auth/logout',
  '/auth/login',
  '/auth/register',
];

function isNoRefreshPath(url: string): boolean {
  const path = new URL(url).pathname;
  return NO_REFRESH_PATHS.some((p) => path === p || path.endsWith(p));
}

// Original request bodies, so the retry can replay them after fetch consumed
// the stream (see web/shared client for the rationale).
const requestBodyCache = new WeakMap<Request, BodyInit | null>();
// Multipart uploads (receipt images) are not copied up front: buffering the whole file on the
// JS thread for every upload only pays off on the rare 401 that slips past the proactive
// refresh. Those requests refresh the token but surface the 401 instead of replaying.
const unreplayable = new WeakSet<Request>();

function isMultipart(request: Request): boolean {
  return request.headers.get('content-type')?.startsWith('multipart/form-data') ?? false;
}

async function cloneBody(request: Request): Promise<BodyInit | null> {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  if (isMultipart(request)) {
    unreplayable.add(request);
    return null;
  }
  try {
    const buf = await request.clone().arrayBuffer();
    return buf.byteLength === 0 ? null : buf;
  } catch {
    return null;
  }
}

/** Re-materialise a response as the global `Response` class (see onResponse). */
async function toGlobalResponse(res: Response): Promise<Response> {
  const body = res.status === 204 || res.status === 304 ? null : await res.arrayBuffer();
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

export function createAuthMiddleware(
  baseUrl: string,
  fetchImpl: typeof fetch = nativeFetch,
): Middleware {
  return {
    async onRequest({ request }) {
      const noRefresh = isNoRefreshPath(request.url);

      // Proactive refresh: avoid the 401 round-trip when we know the token is
      // about to expire. Failure here is not fatal — the 401 path will retry.
      if (!noRefresh && isAccessTokenExpiring(tokenStore.get())) {
        await refreshOnce(baseUrl, fetchImpl);
      }

      for (const [k, v] of Object.entries(buildHeaders())) {
        if (!request.headers.has(k)) request.headers.set(k, v);
      }
      requestBodyCache.set(request, await cloneBody(request));
      return request;
    },

    async onResponse({ request, response }) {
      // openapi-fetch only accepts `instanceof Response` return values, and neither
      // React Native's whatwg polyfill nor Expo's FetchResponse is the global class.
      // Return `undefined` to leave the response untouched and wrap any retry.
      if (response.status !== 401) return undefined;
      if (isNoRefreshPath(request.url)) return undefined;

      if (!tokenStore.get()?.refreshToken) {
        handleAuthExpired();
        return undefined;
      }

      const refreshed = await refreshOnce(baseUrl, fetchImpl);
      if (!refreshed) {
        handleAuthExpired();
        return undefined;
      }
      if (unreplayable.has(request)) return undefined;

      const headers = new Headers(request.headers);
      headers.set('authorization', `Bearer ${refreshed.accessToken}`);
      const retried = await fetchImpl(request.url, {
        method: request.method,
        headers,
        body: requestBodyCache.get(request) ?? null,
      });
      if (retried.status === 401) handleAuthExpired();
      return toGlobalResponse(retried);
    },
  };
}

/**
 * Expo's WinterCG fetch is used instead of React Native's whatwg polyfill: its
 * Response class is the global `Response`, which openapi-fetch's middleware
 * contract requires (`instanceof Response`), and it supports streaming bodies.
 */
const nativeFetch = expoFetch as unknown as typeof fetch;

export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = nativeFetch) {
  const client = createClient<paths>({ baseUrl, fetch: fetchImpl });
  client.use(createAuthMiddleware(baseUrl, fetchImpl));
  return client;
}

export const api = createApiClient(env.apiUrl);
export type ApiClient = typeof api;
