import { missionDestination } from './destination';
it.each([
  ['first_trip', '/trip/new'],
  ['plan_ahead', '/trip/new'],
  ['first_scan', '/(tabs)/board'],
  ['first_board', '/(tabs)/board'],
  ['first_expense', '/(tabs)/trip'],
  ['invite_2', '/(tabs)/trip'],
  ['friend_joined', '/(tabs)/trip'],
  ['trip_settled', '/(tabs)/trip'],
  ['apply_plan', '/(tabs)/market'],
  ['share_plan', '/(tabs)/market'],
  ['rate_plan', '/(tabs)/market'],
])('%s routes to %s', (id, expected) => expect(missionDestination(id, false)).toBe(expected));
it('gates upload, and leaves review to the explicit store handoff', () => {
  expect(missionDestination('upload_plan', false)).toEqual({
    pathname: '/paywall',
    params: { source: 'missions_sheet' },
  });
  expect(missionDestination('upload_plan', true)).toBe('/market/editor');
  expect(missionDestination('appstore_review', false)).toBeNull();
});
