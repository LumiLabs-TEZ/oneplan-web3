import { Linking } from 'react-native';
import Share from 'react-native-share';

import { shareToInstagramStories } from './instagramStories';

jest.mock('@/lib/env', () => ({
  env: {
    variant: 'dev',
    apiUrl: 'https://api.test',
    linkHosts: [],
    androidPackage: 'com.oneplan.app',
    foursquareApiKey: null,
    facebookAppId: 'fb-app-id' as string | null,
  },
  isProd: false,
  webSocketUrl: (path: string) => `wss://api.test${path}`,
}));

const { env } = jest.requireMock('@/lib/env') as { env: { facebookAppId: string | null } };

// `Linking`'s methods are a native-module getter, not a plain own-property — a spy's call
// history survives `jest.restoreAllMocks()` unless explicitly cleared (see openInMaps.test.ts).
afterEach(() => {
  jest.clearAllMocks();
  env.facebookAppId = 'fb-app-id';
});

describe('shareToInstagramStories', () => {
  it('returns unavailable when facebookAppId is unset', async () => {
    env.facebookAppId = null;

    const result = await shareToInstagramStories('file:///tmp/passport.png', 'ios');

    expect(result).toBe('unavailable');
    expect(Share.shareSingle).not.toHaveBeenCalled();
  });

  it('iOS: returns unavailable when the instagram-stories scheme cannot be opened', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);

    const result = await shareToInstagramStories('file:///tmp/passport.png', 'ios');

    expect(result).toBe('unavailable');
    expect(Share.shareSingle).not.toHaveBeenCalled();
  });

  it('iOS: shares via Share.shareSingle when the scheme is openable', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);

    const result = await shareToInstagramStories('file:///tmp/passport.png', 'ios');

    expect(result).toBe('shared');
    expect(Share.shareSingle).toHaveBeenCalledWith({
      social: Share.Social.INSTAGRAM_STORIES,
      backgroundImage: 'file:///tmp/passport.png',
      appId: 'fb-app-id',
    });
  });

  it('a user-closed handoff (shareSingle rejects) still resolves "shared"', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    (Share.shareSingle as jest.Mock).mockRejectedValueOnce(new Error('user cancelled'));

    const result = await shareToInstagramStories('file:///tmp/passport.png', 'ios');

    expect(result).toBe('shared');
  });

  it('Android: returns unavailable when the Instagram package is not installed', async () => {
    (Share.isPackageInstalled as jest.Mock).mockResolvedValueOnce({
      isInstalled: false,
      message: '',
    });

    const result = await shareToInstagramStories('file:///tmp/passport.png', 'android');

    expect(result).toBe('unavailable');
    expect(Share.shareSingle).not.toHaveBeenCalled();
  });

  it('Android: shares via Share.shareSingle when the Instagram package is installed', async () => {
    (Share.isPackageInstalled as jest.Mock).mockResolvedValueOnce({
      isInstalled: true,
      message: '',
    });

    const result = await shareToInstagramStories('file:///tmp/passport.png', 'android');

    expect(result).toBe('shared');
    expect(Share.shareSingle).toHaveBeenCalledWith({
      social: Share.Social.INSTAGRAM_STORIES,
      backgroundImage: 'file:///tmp/passport.png',
      appId: 'fb-app-id',
    });
  });
});
