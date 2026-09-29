// Mission & reward-shop catalog (spec: missions-rewards-spec v1).
//
// Mission ids are a TS string union persisted as VarChar — adding a mission is
// a code change, no migration. Rewards are deliberately NOT flat: weights
// follow strategic value (plan-apply and trip-invite are the two dead funnel
// levers the whole feature exists to fix).

export type MissionGroup = 'getting_started' | 'aha' | 'community' | 'rhythm';

export type MissionId =
  | 'first_trip'
  | 'first_board'
  | 'first_scan'
  | 'first_expense'
  | 'apply_plan'
  | 'invite_2'
  | 'friend_joined'
  | 'trip_settled'
  | 'share_plan'
  | 'rate_plan'
  | 'upload_plan'
  | 'appstore_review'
  | 'plan_ahead';

export const MISSION_IDS: readonly MissionId[] = [
  'first_trip',
  'first_board',
  'first_scan',
  'first_expense',
  'apply_plan',
  'invite_2',
  'friend_joined',
  'trip_settled',
  'share_plan',
  'rate_plan',
  'upload_plan',
  'appstore_review',
  'plan_ahead',
];

export interface MissionDef {
  id: MissionId;
  group: MissionGroup;
  reward: number;
  // One-time missions have no cap fields and are deduped by the partial unique
  // index over (user_id, mission_id) WHERE external_ref IS NULL. Repeatable
  // missions dedupe per external_ref and cap by counting rows per periodKey
  // ('week' | 'month') or over the mission's lifetime ('lifetime').
  cap?: number;
  capPeriod?: 'week' | 'month' | 'lifetime';
  // Progress target shown by the client (e.g. invite 2 friends).
  progressTarget?: number;
}

export const MISSION_DEFS: Record<MissionId, MissionDef> = {
  first_trip: { id: 'first_trip', group: 'getting_started', reward: 10 },
  first_board: { id: 'first_board', group: 'getting_started', reward: 10 },
  first_scan: { id: 'first_scan', group: 'getting_started', reward: 20 },
  first_expense: { id: 'first_expense', group: 'getting_started', reward: 10 },
  apply_plan: { id: 'apply_plan', group: 'aha', reward: 40 },
  invite_2: { id: 'invite_2', group: 'aha', reward: 50, progressTarget: 2 },
  friend_joined: {
    id: 'friend_joined',
    group: 'aha',
    reward: 30,
    cap: 3,
    capPeriod: 'lifetime',
    progressTarget: 3,
  },
  trip_settled: { id: 'trip_settled', group: 'aha', reward: 40 },
  share_plan: { id: 'share_plan', group: 'community', reward: 10 },
  rate_plan: {
    id: 'rate_plan',
    group: 'community',
    reward: 10,
    cap: 3,
    capPeriod: 'lifetime',
  },
  upload_plan: {
    id: 'upload_plan',
    group: 'community',
    reward: 60,
    cap: 1,
    capPeriod: 'month',
  },
  appstore_review: { id: 'appstore_review', group: 'community', reward: 30 },
  plan_ahead: { id: 'plan_ahead', group: 'rhythm', reward: 20 },
};

// ── Reward shop ────────────────────────────────────────────────────────────

export type ShopItemId =
  | 'scan_credit_1'
  | 'market_unlock'
  | 'pro_7d'
  | 'pro_30d';

export type ShopRewardType = 'scan_credit' | 'market_unlock' | 'pro_days';

export interface ShopItemDef {
  id: ShopItemId;
  price: number;
  rewardType: ShopRewardType;
  // scan_credit: credits granted per redemption.
  creditAmount?: number;
  // pro_days: Pro time added per redemption, and the productId written to the
  // user row (reuses gift's SKUs so resolveTier keeps working).
  proDays?: number;
  proProductId?: 'pro_weekly' | 'pro_monthly';
  // Pro items are frequency-capped per quarter so the shop anchors the
  // subscription's value instead of cannibalizing it (spec §4).
  capPerQuarter?: number;
}

export const SHOP_ITEMS: Record<ShopItemId, ShopItemDef> = {
  scan_credit_1: {
    id: 'scan_credit_1',
    price: 30,
    rewardType: 'scan_credit',
    creditAmount: 1,
  },
  market_unlock: {
    id: 'market_unlock',
    price: 80,
    rewardType: 'market_unlock',
  },
  pro_7d: {
    id: 'pro_7d',
    price: 150,
    rewardType: 'pro_days',
    proDays: 7,
    proProductId: 'pro_weekly',
    capPerQuarter: 2,
  },
  pro_30d: {
    id: 'pro_30d',
    price: 300,
    rewardType: 'pro_days',
    proDays: 30,
    proProductId: 'pro_monthly',
    capPerQuarter: 1,
  },
};

export const SHOP_ITEM_IDS: readonly ShopItemId[] = [
  'scan_credit_1',
  'market_unlock',
  'pro_7d',
  'pro_30d',
];

// Client-reported mission events (POST /missions/events). Everything else is
// strictly server-verified — same spoof-protection stance as
// SCAN_PACK_PURCHASED. share_plan / appstore_review are the accepted
// exceptions: small, capped rewards for actions the server cannot observe.
export type MissionClientEvent =
  | 'market_shared'
  | 'appstore_review_opened'
  | 'missions_sheet_viewed';

export const MISSION_CLIENT_EVENTS: readonly MissionClientEvent[] = [
  'market_shared',
  'appstore_review_opened',
  'missions_sheet_viewed',
];
