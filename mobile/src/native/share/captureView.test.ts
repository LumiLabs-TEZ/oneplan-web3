import { captureRef } from 'react-native-view-shot';

import { captureView } from './captureView';

describe('captureView', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('captures at the requested width and returns the file URI as-is when already prefixed', async () => {
    (captureRef as jest.Mock).mockResolvedValueOnce('file:///tmp/passport.png');

    const uri = await captureView({ current: null }, { width: 360, pixelRatio: 3 });

    expect(uri).toBe('file:///tmp/passport.png');
    expect(captureRef).toHaveBeenCalledWith(
      { current: null },
      { format: 'png', quality: 1, result: 'tmpfile', width: 360 },
    );
  });

  it('prefixes a bare path with file://', async () => {
    (captureRef as jest.Mock).mockResolvedValueOnce('/tmp/passport.png');

    const uri = await captureView({ current: null }, { width: 360, pixelRatio: 3 });

    expect(uri).toBe('file:///tmp/passport.png');
  });

  it('throws the i18n-key error message when the capture rejects', async () => {
    (captureRef as jest.Mock).mockRejectedValueOnce(new Error('native failure'));

    await expect(captureView({ current: null }, { width: 360, pixelRatio: 3 })).rejects.toThrow(
      'Could not render the passport image',
    );
  });
});
