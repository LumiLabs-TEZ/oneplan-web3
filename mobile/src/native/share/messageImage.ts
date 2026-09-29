/**
 * Share an image via the native Message compose sheet — port of `MessageComposeView`
 * (`MFMessageComposeViewController` with a PNG attachment). `expo-sms`'s `SMSOptions.attachments`
 * (node_modules/expo-sms/build/SMS.types.d.ts) is iOS-only in practice — Android's SMS intent
 * can't carry an image attachment — so Android always resolves `'unavailable'` and the caller
 * falls back to `systemShare`.
 */
import * as SMS from 'expo-sms';
import { Platform } from 'react-native';

export type MessageImageResult = 'sent' | 'cancelled' | 'unavailable';

export async function shareImageViaMessage(
  uri: string,
  platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android',
): Promise<MessageImageResult> {
  if (platform !== 'ios') return 'unavailable';

  const available = await SMS.isAvailableAsync();
  if (!available) return 'unavailable';

  const { result } = await SMS.sendSMSAsync([], '', {
    attachments: { uri, mimeType: 'image/png', filename: 'passport.png' },
  });

  return result === 'sent' ? 'sent' : 'cancelled';
}
