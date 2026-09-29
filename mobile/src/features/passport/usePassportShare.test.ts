import { onlineManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createRef } from 'react';
import { Alert, type View } from 'react-native';

import { initI18n } from '@/i18n';

import { usePassportShare } from './usePassportShare';

jest.mock('@/native/share', () => ({
  captureView: jest.fn(async () => 'file:///tmp/passport.png'),
  shareToInstagramStories: jest.fn(async () => 'shared'),
  shareImageViaMessage: jest.fn(async () => 'sent'),
  saveImageToPhotos: jest.fn(async () => 'saved'),
  systemShare: jest.fn(async () => undefined),
}));

const share = jest.requireMock('@/native/share') as {
  captureView: jest.Mock;
  shareToInstagramStories: jest.Mock;
  shareImageViaMessage: jest.Mock;
  saveImageToPhotos: jest.Mock;
  systemShare: jest.Mock;
};

beforeAll(() => {
  initI18n();
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  onlineManager.setOnline(true);
});

const hostRef = createRef<View>();

describe('usePassportShare', () => {
  it('still saves to Photos while offline — the whole flow is local', async () => {
    onlineManager.setOnline(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await renderHook(() => usePassportShare(hostRef));

    await act(async () => {
      await result.current.share('photos');
    });

    expect(share.captureView).toHaveBeenCalled();
    expect(share.saveImageToPhotos).toHaveBeenCalledWith('file:///tmp/passport.png');
    expect(alertSpy).toHaveBeenCalledWith('Saved to Photos');
  });

  it('instagram: captures then shares to Instagram Stories', async () => {
    const { result } = await renderHook(() => usePassportShare(hostRef));

    await act(async () => {
      await result.current.share('instagram');
    });

    expect(share.captureView).toHaveBeenCalledWith(hostRef, { width: 360, pixelRatio: 3 });
    expect(share.shareToInstagramStories).toHaveBeenCalledWith('file:///tmp/passport.png');
    expect(share.systemShare).not.toHaveBeenCalled();
  });

  it('instagram: falls back to the system share sheet when unavailable', async () => {
    share.shareToInstagramStories.mockResolvedValueOnce('unavailable');
    const { result } = await renderHook(() => usePassportShare(hostRef));

    await act(async () => {
      await result.current.share('instagram');
    });

    expect(share.systemShare).toHaveBeenCalledWith('file:///tmp/passport.png');
  });

  it('message: falls back to the system share sheet when unavailable', async () => {
    share.shareImageViaMessage.mockResolvedValueOnce('unavailable');
    const { result } = await renderHook(() => usePassportShare(hostRef));

    await act(async () => {
      await result.current.share('message');
    });

    expect(share.systemShare).toHaveBeenCalledWith('file:///tmp/passport.png');
  });

  it('message: does not fall back when the message was sent or cancelled', async () => {
    const { result } = await renderHook(() => usePassportShare(hostRef));

    await act(async () => {
      await result.current.share('message');
    });

    expect(share.systemShare).not.toHaveBeenCalled();
  });

  it('photos: alerts "Saved to Photos" on success', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await renderHook(() => usePassportShare(hostRef));

    await act(async () => {
      await result.current.share('photos');
    });

    expect(alertSpy).toHaveBeenCalledWith('Saved to Photos');
  });

  it('photos: alerts the permission message when denied', async () => {
    share.saveImageToPhotos.mockResolvedValueOnce('denied');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await renderHook(() => usePassportShare(hostRef));

    await act(async () => {
      await result.current.share('photos');
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Allow photo library access in Settings to save your passport',
    );
  });

  it('capture failure: alerts the render-error message whatever the native error said', async () => {
    share.captureView.mockRejectedValueOnce(new Error('UIView snapshot failed: -50'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await renderHook(() => usePassportShare(hostRef));

    await act(async () => {
      await result.current.share('photos');
    });

    expect(alertSpy).toHaveBeenCalledWith('Could not render the passport image');
    expect(share.saveImageToPhotos).not.toHaveBeenCalled();
  });

  it('an unexpected failure after the capture alerts the generic message, not the raw error', async () => {
    share.saveImageToPhotos.mockRejectedValueOnce(new Error('PHPhotoLibrary exploded'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await renderHook(() => usePassportShare(hostRef));

    await act(async () => {
      await result.current.share('photos');
    });

    expect(alertSpy).toHaveBeenCalledWith('Something went wrong');
    expect(alertSpy).not.toHaveBeenCalledWith('PHPhotoLibrary exploded');
  });

  it('sets busy synchronously (before the capture resolves), then clears it once done', async () => {
    let resolveCapture: (uri: string) => void = () => {};
    share.captureView.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveCapture = () => resolve('file:///tmp/passport.png');
        }),
    );
    const { result } = await renderHook(() => usePassportShare(hostRef));
    expect(result.current.busy).toBe(false);

    const pending = result.current.share('photos');
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      resolveCapture('file:///tmp/passport.png');
      await pending;
    });

    expect(result.current.busy).toBe(false);
  });
});
