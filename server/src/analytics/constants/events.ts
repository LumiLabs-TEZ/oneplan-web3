import { AnalyticsEventName } from '@prisma/client';

export { AnalyticsEventName };

/** @deprecated Use the Prisma enum {@link AnalyticsEventName} directly. */
export const ANALYTICS_EVENTS = AnalyticsEventName;

export const ANALYTICS_EVENT_VALUES = Object.values(
  AnalyticsEventName,
) as AnalyticsEventName[];

export const CLIENT_EMITTED_EVENTS: ReadonlySet<AnalyticsEventName> = new Set([
  AnalyticsEventName.APP_OPEN,
  AnalyticsEventName.MARKET_OPENED,
  AnalyticsEventName.PLAN_VIEWED,
  AnalyticsEventName.SUBSCRIPTION_VIEWED,
  AnalyticsEventName.RESTORE_PURCHASE_CLICKED,
  // Client-fired when the buy-scan-credits sheet appears. SCAN_PACK_PURCHASED
  // / SCAN_CREDITS_GRANTED are deliberately NOT here — server-emitted only, so
  // a spoofed client POST /analytics/events for them is dropped.
  AnalyticsEventName.SCAN_CREDITS_PAYWALL_VIEWED,
  // Board/Pin UI-intent events. The PIN_EXTRACTION_* / PIN_QUOTA_BLOCKED
  // lifecycle events are deliberately NOT here — server-emitted only (spoof
  // protection + they carry server-only truth like fromCache / errorCode).
  AnalyticsEventName.BOARD_OPENED,
  AnalyticsEventName.PIN_LINK_SUBMITTED,
  AnalyticsEventName.PINS_SAVED,
  // Client-fired when the user taps Share on a marketplace listing detail.
  AnalyticsEventName.MARKET_SHARED,
  // Client-fired when the user taps an engagement push. ENGAGEMENT_PUSH_SENT is
  // deliberately NOT here — server-emitted only (spoof protection).
  AnalyticsEventName.ENGAGEMENT_PUSH_OPENED,
  // Client-fired when the missions sheet appears (also reachable via
  // POST /missions/events). MISSION_COMPLETED / REWARD_REDEEMED /
  // BOARD_CREATED are deliberately NOT here — server-emitted only.
  AnalyticsEventName.MISSIONS_SHEET_VIEWED,
]);
