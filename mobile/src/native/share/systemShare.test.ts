import { Share as RNShare } from 'react-native';
import Share from 'react-native-share';

import { systemShare } from './systemShare';

afterEach(() => {
  jest.clearAllMocks();
});

describe('systemShare', () => {
  it('iOS: opens the RN Share sheet with the file URL', async () => {
    const spy = jest.spyOn(RNShare, 'share').mockResolvedValue({ action: 'sharedAction' });

    await systemShare('file:///tmp/passport.png', 'ios');

    expect(spy).toHaveBeenCalledWith({ url: 'file:///tmp/passport.png' });
    expect(Share.open).not.toHaveBeenCalled();
  });

  it('Android: opens react-native-share with a PNG mime type', async () => {
    const spy = jest.spyOn(RNShare, 'share').mockResolvedValue({ action: 'sharedAction' });

    await systemShare('file:///tmp/passport.png', 'android');

    expect(spy).not.toHaveBeenCalled();
    expect(Share.open).toHaveBeenCalledWith({ url: 'file:///tmp/passport.png', type: 'image/png' });
  });
});
