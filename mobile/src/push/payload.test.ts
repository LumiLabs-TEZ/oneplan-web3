import { extractData, parsePositiveInt, parsePushPayload } from './payload';

describe('parsePositiveInt', () => {
  it.each([
    [7, 7],
    ['7', 7],
    [' 42 ', 42],
    ['+3', 3],
    [0, null],
    [-1, null],
    ['-1', null],
    [1.5, null],
    ['1.5', null],
    ['', null],
    ['abc', null],
    [null, null],
    [undefined, null],
    [true, null],
    [{}, null],
  ])('%p → %p', (input, expected) => {
    expect(parsePositiveInt(input)).toBe(expected);
  });
});

describe('extractData', () => {
  it('returns {} for non-objects', () => {
    expect(extractData(null)).toEqual({});
    expect(extractData('x')).toEqual({});
    expect(extractData(42)).toEqual({});
    expect(extractData([1, 2])).toEqual({});
  });

  it('passes flat maps through', () => {
    expect(extractData({ type: 'member_joined', tripId: '5' })).toEqual({
      type: 'member_joined',
      tripId: '5',
    });
  });

  it('unwraps a nested `data` map (Android data-only shape)', () => {
    expect(extractData({ data: { type: 'member_joined', tripId: '5' } })).toEqual({
      data: { type: 'member_joined', tripId: '5' },
      type: 'member_joined',
      tripId: '5',
    });
  });

  it('unwraps a nested `body` map and a JSON-encoded `body` string', () => {
    expect(extractData({ body: { type: 'friend_request' } }).type).toBe('friend_request');
    expect(extractData({ body: '{"type":"friend_request"}' }).type).toBe('friend_request');
    expect(extractData({ body: 'plain text', type: 'x' }).type).toBe('x');
  });
});

describe('parsePushPayload', () => {
  it('garbage / non-object → { link: null }', () => {
    expect(parsePushPayload(undefined)).toEqual({ link: null });
    expect(parsePushPayload(null)).toEqual({ link: null });
    expect(parsePushPayload('nope')).toEqual({ link: null });
    expect(parsePushPayload(12)).toEqual({ link: null });
    expect(parsePushPayload({})).toEqual({ link: null });
    expect(parsePushPayload({ type: 'unknown_thing' })).toEqual({ link: null });
  });

  describe('trip_invite', () => {
    it('routes to the invite code', () => {
      expect(parsePushPayload({ type: 'trip_invite', inviteCode: ' ABC123 ' })).toEqual({
        link: { kind: 'tripInvite', inviteCode: 'ABC123' },
      });
    });
    it('ignores a missing/blank inviteCode', () => {
      expect(parsePushPayload({ type: 'trip_invite' })).toEqual({ link: null });
      expect(parsePushPayload({ type: 'trip_invite', inviteCode: '  ' })).toEqual({ link: null });
    });
  });

  it('friend_request', () => {
    expect(parsePushPayload({ type: 'friend_request' })).toEqual({
      link: { kind: 'friendRequest' },
    });
  });

  describe('listing_approved / listing_rejected', () => {
    it.each(['listing_approved', 'listing_rejected'])('%s with numeric id', (type) => {
      expect(parsePushPayload({ type, listingId: 12 })).toEqual({
        link: { kind: 'listing', listingId: 12 },
      });
    });
    it.each(['listing_approved', 'listing_rejected'])('%s with string id', (type) => {
      expect(parsePushPayload({ type, listingId: '12' })).toEqual({
        link: { kind: 'listing', listingId: 12 },
      });
    });
    it('requires a listingId', () => {
      expect(parsePushPayload({ type: 'listing_approved' })).toEqual({ link: null });
      expect(parsePushPayload({ type: 'listing_rejected', listingId: 0 })).toEqual({ link: null });
    });
  });

  describe('trip_request_fulfilled', () => {
    it('with listingId → listing', () => {
      expect(parsePushPayload({ type: 'trip_request_fulfilled', listingId: '9' })).toEqual({
        link: { kind: 'listing', listingId: 9 },
      });
    });
    it('without listingId → market', () => {
      expect(parsePushPayload({ type: 'trip_request_fulfilled' })).toEqual({
        link: { kind: 'market' },
      });
    });
  });

  describe('pin_extraction_completed', () => {
    it('routes to the session', () => {
      expect(parsePushPayload({ type: 'pin_extraction_completed', sessionId: 'sess-1' })).toEqual({
        link: { kind: 'pinExtraction', sessionId: 'sess-1' },
      });
    });
    it('requires a sessionId', () => {
      expect(parsePushPayload({ type: 'pin_extraction_completed' })).toEqual({ link: null });
    });
  });

  it('mission_completed → missions', () => {
    expect(parsePushPayload({ type: 'mission_completed' })).toEqual({
      link: { kind: 'missions' },
    });
  });

  describe('admin_broadcast', () => {
    it('destination board', () => {
      expect(parsePushPayload({ type: 'admin_broadcast', destination: 'board' })).toEqual({
        link: { kind: 'board' },
      });
    });
    it('destination market with/without listingId', () => {
      expect(
        parsePushPayload({ type: 'admin_broadcast', destination: 'market', listingId: '4' }),
      ).toEqual({ link: { kind: 'listing', listingId: 4 } });
      expect(parsePushPayload({ type: 'admin_broadcast', destination: 'market' })).toEqual({
        link: { kind: 'market' },
      });
    });
    it('no/unknown destination → just open the app', () => {
      expect(parsePushPayload({ type: 'admin_broadcast' })).toEqual({ link: null });
      expect(parsePushPayload({ type: 'admin_broadcast', destination: 'chat' })).toEqual({
        link: null,
      });
      // even a tripId does not make it a trip push
      expect(parsePushPayload({ type: 'admin_broadcast', tripId: 3 })).toEqual({ link: null });
    });
  });

  describe('engagement_*', () => {
    it('engagement_new_plan → listing or market, tracks the type', () => {
      expect(parsePushPayload({ type: 'engagement_new_plan', listingId: 7 })).toEqual({
        link: { kind: 'listing', listingId: 7 },
        engagementType: 'engagement_new_plan',
      });
      expect(parsePushPayload({ type: 'engagement_new_plan' })).toEqual({
        link: { kind: 'market' },
        engagementType: 'engagement_new_plan',
      });
    });
    it('engagement_dormant → board', () => {
      expect(parsePushPayload({ type: 'engagement_dormant' })).toEqual({
        link: { kind: 'board' },
        engagementType: 'engagement_dormant',
      });
    });
    it('engagement_weather → trip (null without tripId)', () => {
      expect(parsePushPayload({ type: 'engagement_weather', tripId: '21' })).toEqual({
        link: { kind: 'trip', tripId: 21 },
        engagementType: 'engagement_weather',
      });
      expect(parsePushPayload({ type: 'engagement_weather' })).toEqual({
        link: null,
        engagementType: 'engagement_weather',
      });
    });
    it('engagement_unfinished_plan → trip with refreshPlan', () => {
      expect(parsePushPayload({ type: 'engagement_unfinished_plan', tripId: 8 })).toEqual({
        link: { kind: 'trip', tripId: 8, refreshPlan: true },
        engagementType: 'engagement_unfinished_plan',
      });
    });
    it('unknown engagement variant → tracked, no link (even with tripId)', () => {
      expect(parsePushPayload({ type: 'engagement_future', tripId: 8 })).toEqual({
        link: null,
        engagementType: 'engagement_future',
      });
    });
  });

  describe('trip-scoped types', () => {
    it.each(['member_left', 'member_joined'])('%s → trip', (type) => {
      expect(parsePushPayload({ type, tripId: 33 })).toEqual({
        link: { kind: 'trip', tripId: 33 },
      });
      expect(parsePushPayload({ type, tripId: '33' })).toEqual({
        link: { kind: 'trip', tripId: 33 },
      });
    });

    it('plan_reminder with planItemId', () => {
      expect(parsePushPayload({ type: 'plan_reminder', tripId: '2', planItemId: '77' })).toEqual({
        link: { kind: 'trip', tripId: 2, planItemId: 77 },
      });
    });
    it('plan_reminder without planItemId → trip', () => {
      expect(parsePushPayload({ type: 'plan_reminder', tripId: 2 })).toEqual({
        link: { kind: 'trip', tripId: 2 },
      });
      expect(parsePushPayload({ type: 'plan_reminder', tripId: 2, planItemId: 'x' })).toEqual({
        link: { kind: 'trip', tripId: 2 },
      });
    });

    it('unknown type with a tripId → trip (forward compat)', () => {
      expect(parsePushPayload({ type: 'brand_new_type', tripId: 5 })).toEqual({
        link: { kind: 'trip', tripId: 5 },
      });
    });
    it('missing type with a tripId → trip', () => {
      expect(parsePushPayload({ tripId: '5' })).toEqual({ link: { kind: 'trip', tripId: 5 } });
    });
    it('rejects non-positive / non-integer tripIds', () => {
      expect(parsePushPayload({ type: 'member_joined', tripId: 0 })).toEqual({ link: null });
      expect(parsePushPayload({ type: 'member_joined', tripId: '-4' })).toEqual({ link: null });
      expect(parsePushPayload({ type: 'member_joined', tripId: 1.5 })).toEqual({ link: null });
      expect(parsePushPayload({ type: 'member_joined', tripId: 'abc' })).toEqual({ link: null });
      expect(parsePushPayload({ type: 'member_joined' })).toEqual({ link: null });
    });
  });

  it('accepts the nested Android `data` map', () => {
    expect(parsePushPayload({ data: { type: 'member_joined', tripId: '5' } })).toEqual({
      link: { kind: 'trip', tripId: 5 },
    });
    expect(parsePushPayload({ data: { type: 'trip_invite', inviteCode: 'Z9' } })).toEqual({
      link: { kind: 'tripInvite', inviteCode: 'Z9' },
    });
  });
});
