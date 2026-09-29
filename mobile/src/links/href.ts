import type { Href } from 'expo-router';

import type { Link } from './link';

/**
 * Route for a `Link`, or `null` when the destination screen does not exist
 * yet (the caller parks it in `pendingLinkStore` for a later phase).
 */
export function hrefForLink(link: Link): Href | null {
  switch (link.kind) {
    case 'trip':
      return { pathname: '/trip/[tripId]', params: { tripId: String(link.tripId) } };
    case 'tripInvite':
      return { pathname: '/join/[code]', params: { code: link.inviteCode } };
    case 'friendInvite':
      return { pathname: '/friend/[code]', params: { code: link.friendCode } };
    // No per-request deep link on the server (the push carries no id): land on the friends list,
    // where the pending-request rows open `/friend-request/[id]`.
    case 'friendRequest':
      return '/profile/friends';
    case 'listing':
      return { pathname: '/market/listing/[id]', params: { id: String(link.listingId) } };
    case 'market':
      return '/(tabs)/market';
    case 'pinExtractUrl':
      return { pathname: '/board/extract', params: { sourceUrl: link.sourceUrl } };
    case 'pinExtraction':
      return { pathname: '/board/extract', params: { sessionId: link.sessionId } };
    case 'missions':
      return { pathname: '/missions', params: { source: 'push' } };
    case 'board':
      return '/(tabs)/board';
    default:
      return null;
  }
}
