import type { Href } from 'expo-router';
export function missionDestination(id: string, isPro: boolean): Href | null {
  switch (id) {
    case 'first_trip':
    case 'plan_ahead':
      return '/trip/new';
    case 'first_board':
    case 'first_scan':
      return '/(tabs)/board';
    case 'first_expense':
    case 'invite_2':
    case 'friend_joined':
    case 'trip_settled':
      return '/(tabs)/trip';
    case 'apply_plan':
    case 'share_plan':
    case 'rate_plan':
    case 'market_unlock':
      return '/(tabs)/market';
    case 'upload_plan':
      return isPro
        ? '/market/editor'
        : { pathname: '/paywall', params: { source: 'missions_sheet' } };
    default:
      return null;
  }
}
