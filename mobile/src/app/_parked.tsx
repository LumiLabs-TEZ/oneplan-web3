/**
 * Sink for `+native-intent.ts`'s "no screen yet" deep-link branch: a warm
 * start with a parked link (Phase 5/7 kinds — listing, pin extraction,
 * missions; friend invites resolve to `/friend/[code]` since M3.4) should leave the current screen exactly as it was,
 * not flash a blank route while `useLinkResolver` replays it. Renders
 * nothing and immediately bounces back to where the user was.
 */
import { router } from 'expo-router';
import { useEffect } from 'react';

export default function Parked() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  return null;
}
