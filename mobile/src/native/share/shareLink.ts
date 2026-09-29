import { Share } from 'react-native';
/** Text links must not use the image-only Android sharing adapter. */
export async function shareLink(url: string) {
  const result = await Share.share({ message: url });
  return result.action === Share.sharedAction;
}
