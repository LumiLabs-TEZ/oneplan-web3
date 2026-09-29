import type { components } from '@/api/schema';

export type AnalyticsEventName = components['schemas']['AnalyticsEventName'];

/**
 * Events the server accepts from clients (`server/src/analytics/constants/events.ts`
 * `CLIENT_EMITTED_EVENTS`). Anything else posted to `POST /analytics/events`
 * is dropped server-side, so the client refuses to queue it at all.
 */
export const CLIENT_EVENTS = [
  'APP_OPEN',
  'MARKET_OPENED',
  'PLAN_VIEWED',
  'SUBSCRIPTION_VIEWED',
  'RESTORE_PURCHASE_CLICKED',
  'SCAN_CREDITS_PAYWALL_VIEWED',
  'BOARD_OPENED',
  'PIN_LINK_SUBMITTED',
  'PINS_SAVED',
  'MARKET_SHARED',
  'ENGAGEMENT_PUSH_OPENED',
  'MISSIONS_SHEET_VIEWED',
] as const satisfies readonly AnalyticsEventName[];

export type ClientEventName = (typeof CLIENT_EVENTS)[number];

const CLIENT_EVENT_SET: ReadonlySet<string> = new Set(CLIENT_EVENTS);

export function isClientEvent(name: string): name is ClientEventName {
  return CLIENT_EVENT_SET.has(name);
}
