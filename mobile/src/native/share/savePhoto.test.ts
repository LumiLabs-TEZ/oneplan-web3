import * as MediaLibrary from 'expo-media-library';

import { saveImageToPhotos } from './savePhoto';

afterEach(() => {
  jest.clearAllMocks();
});

describe('saveImageToPhotos', () => {
  it('saves and returns saved when permission is granted', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'granted',
      granted: true,
    });

    const result = await saveImageToPhotos('file:///tmp/passport.png');

    expect(result).toBe('saved');
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true);
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///tmp/passport.png');
  });

  it('returns denied when permission is not granted, without attempting the save', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
      granted: false,
    });

    const result = await saveImageToPhotos('file:///tmp/passport.png');

    expect(result).toBe('denied');
    expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
  });

  it('returns failed when saveToLibraryAsync throws', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'granted',
      granted: true,
    });
    (MediaLibrary.saveToLibraryAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

    const result = await saveImageToPhotos('file:///tmp/passport.png');

    expect(result).toBe('failed');
  });
});
