import * as SMS from 'expo-sms';

import { shareImageViaMessage } from './messageImage';

afterEach(() => {
  jest.clearAllMocks();
});

describe('shareImageViaMessage', () => {
  it('returns unavailable on Android without checking SMS availability', async () => {
    const result = await shareImageViaMessage('file:///tmp/passport.png', 'android');

    expect(result).toBe('unavailable');
    expect(SMS.isAvailableAsync).not.toHaveBeenCalled();
  });

  it('returns unavailable on iOS when SMS is not available', async () => {
    (SMS.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);

    const result = await shareImageViaMessage('file:///tmp/passport.png', 'ios');

    expect(result).toBe('unavailable');
    expect(SMS.sendSMSAsync).not.toHaveBeenCalled();
  });

  it('sends the PNG as an attachment and returns sent', async () => {
    (SMS.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    (SMS.sendSMSAsync as jest.Mock).mockResolvedValueOnce({ result: 'sent' });

    const result = await shareImageViaMessage('file:///tmp/passport.png', 'ios');

    expect(result).toBe('sent');
    expect(SMS.sendSMSAsync).toHaveBeenCalledWith([], '', {
      attachments: {
        uri: 'file:///tmp/passport.png',
        mimeType: 'image/png',
        filename: 'passport.png',
      },
    });
  });

  it('returns cancelled when the compose sheet is dismissed', async () => {
    (SMS.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    (SMS.sendSMSAsync as jest.Mock).mockResolvedValueOnce({ result: 'cancelled' });

    const result = await shareImageViaMessage('file:///tmp/passport.png', 'ios');

    expect(result).toBe('cancelled');
  });
});
