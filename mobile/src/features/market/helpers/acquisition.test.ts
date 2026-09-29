import { acquisitionAction, canAffordUnlock } from './acquisition';
const shop = {
  itemId: 'market_unlock',
  price: 30,
  rewardType: 'market_unlock',
  redeemedCount: 0,
  available: true,
};
const base = { owner: false, acquired: false, isPro: false, approved: true, shop };
it('owners never acquire, even when Pro or acquired', () => {
  expect(acquisitionAction({ ...base, owner: true, isPro: true, acquired: true })).toBe('none');
});
it('acquisition bypasses Pro and listing availability', () => {
  expect(acquisitionAction({ ...base, acquired: true, approved: false })).toBe('apply');
});
it('Pro acquires directly', () => {
  expect(acquisitionAction({ ...base, isPro: true })).toBe('acquire');
});
it('free users choose only available shop items', () => {
  expect(acquisitionAction(base)).toBe('choose');
  expect(acquisitionAction({ ...base, shop: { ...shop, available: false } })).toBe('pro');
  expect(acquisitionAction({ ...base, shop: undefined })).toBe('pro');
});
it('non-approved plans have no acquisition action', () => {
  expect(acquisitionAction({ ...base, approved: false, isPro: true })).toBe('none');
});
it('Spark balance must cover current price and item must be available', () => {
  expect(canAffordUnlock(29, shop)).toBe(false);
  expect(canAffordUnlock(30, shop)).toBe(true);
  expect(canAffordUnlock(100, { ...shop, available: false })).toBe(false);
  expect(canAffordUnlock(NaN, shop)).toBe(false);
});
