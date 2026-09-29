/**
 * Instagram Stories share — port of `PassportShareService.shareToInstagramStories` (iOS
 * pasteboard handoff to `instagram-stories://share`), routed through `react-native-share`'s
 * `Share.shareSingle` (node_modules/react-native-share/lib/typescript/types.d.ts
 * `InstagramStoriesShareSingleOptions` — `social`, `backgroundImage`, `appId` required) so the
 * same call works on Android too. Availability check differs per platform: iOS uses
 * `Linking.canOpenURL` on the custom scheme, Android uses `Share.isPackageInstalled`
 * (`IsPackageInstalledResult.isInstalled`).
 */
import { Linking, Platform } from 'react-native';
import Share, { type Social } from 'react-native-share';

import { env } from '@/lib/env';

export type InstagramStoriesResult = 'shared' | 'unavailable';

const INSTAGRAM_STORIES_URL = 'instagram-stories://share';
const INSTAGRAM_ANDROID_PACKAGE = 'com.instagram.android';

export async function shareToInstagramStories(
  uri: string,
  platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android',
): Promise<InstagramStoriesResult> {
  if (!env.facebookAppId) return 'unavailable';

  const installed =
    platform === 'ios'
      ? await Linking.canOpenURL(INSTAGRAM_STORIES_URL)
      : (await Share.isPackageInstalled(INSTAGRAM_ANDROID_PACKAGE)).isInstalled;

  if (!installed) return 'unavailable';

  try {
    await Share.shareSingle({
      // `RNShare.Social.INSTAGRAM_STORIES` (the runtime constant) is typed as a plain `string`,
      // while `ShareSingleOptions.social` wants the named `Social` enum — same runtime value
      // ("instagramstories"), so this cast is safe.
      social: Share.Social.INSTAGRAM_STORIES as Social,
      backgroundImage: uri,
      appId: env.facebookAppId,
    });
  } catch {
    // A user-closed handoff/dialog rejects the promise — still counts as "shared" (no error alert).
  }
  return 'shared';
}
