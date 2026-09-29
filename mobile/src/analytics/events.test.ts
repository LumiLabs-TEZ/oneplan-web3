import { CLIENT_EVENTS, isClientEvent } from './events';

describe('CLIENT_EVENTS', () => {
  it('matches the server CLIENT_EMITTED_EVENTS list exactly', () => {
    expect([...CLIENT_EVENTS].sort()).toEqual(
      [
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
      ].sort(),
    );
    expect(CLIENT_EVENTS).toHaveLength(12);
    expect(new Set(CLIENT_EVENTS).size).toBe(12);
  });

  it('isClientEvent accepts client events and rejects server-only ones', () => {
    expect(isClientEvent('APP_OPEN')).toBe(true);
    expect(isClientEvent('ENGAGEMENT_PUSH_OPENED')).toBe(true);
    expect(isClientEvent('SCAN_PACK_PURCHASED')).toBe(false);
    expect(isClientEvent('ENGAGEMENT_PUSH_SENT')).toBe(false);
    expect(isClientEvent('not_an_event')).toBe(false);
  });
});
