import { anonymousId, currentSessionId } from '@/analytics/session';
import { tokenStore } from '@/auth/tokenStore';
import { currentLanguage } from '@/i18n';

/**
 * The four headers every OnePlan request carries (APIClient.swift:
 * `httpAdditionalHeaders` + `AnalyticsHeadersMiddleware`).
 */
export function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'accept-language': currentLanguage(),
    'x-anonymous-id': anonymousId(),
  };
  const tokens = tokenStore.get();
  if (tokens?.accessToken) headers.authorization = `Bearer ${tokens.accessToken}`;
  const session = currentSessionId();
  if (session) headers['x-session-id'] = session;
  return headers;
}
