/**
 * Fallback share sheet used when a dedicated destination (Instagram Stories, Message) is
 * unavailable — port of `ActivityShareSheet` (`UIActivityViewController`). iOS uses React
 * Native's own `Share.share` (node_modules/react-native/Libraries/Share/Share.d.ts); Android uses
 * `react-native-share`'s `Share.open` instead, since RN's `Share.share` has no `type`/mime hint
 * and Android needs one to target an image-only share sheet.
 */
import { Platform, Share as RNShare } from 'react-native';
import Share from 'react-native-share';

export async function systemShare(
  uri: string,
  platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android',
): Promise<void> {
  if (platform === 'ios') {
    await RNShare.share({ url: uri });
    return;
  }
  await Share.open({ url: uri, type: 'image/png' });
}
