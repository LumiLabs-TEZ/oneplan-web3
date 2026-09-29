import { render } from '@testing-library/react-native';
import { scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

import { pickQrFromPhoto, QRScanner } from './QRScanner';

const mockedUseCameraPermissions = useCameraPermissions as jest.Mock;
const mockedScanFromURLAsync = scanFromURLAsync as jest.Mock;
const mockedLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;

describe('QRScanner', () => {
  beforeEach(() => {
    mockedUseCameraPermissions.mockReturnValue([
      { granted: true, status: 'granted' },
      jest.fn(async () => ({ granted: true, status: 'granted' })),
    ]);
  });

  it('inactive: does not mount CameraView and does not request permission, even when already granted', async () => {
    const request = jest.fn(async () => ({ granted: true, status: 'granted' }));
    mockedUseCameraPermissions.mockReturnValue([{ granted: true, status: 'granted' }, request]);
    const screen = await render(<QRScanner active={false} onCode={jest.fn()} />);
    expect(screen.queryByTestId('qr-scanner')).toBeNull();
    expect(screen.queryByText('Camera preview is unavailable.')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('active + granted: mounts CameraView once', async () => {
    const screen = await render(<QRScanner active onCode={jest.fn()} />);
    expect(screen.getByTestId('qr-scanner')).toBeTruthy();
  });

  it('active + request still pending: shows the empty placeholder, not "unavailable"', async () => {
    // Never resolves — asserts the fallback card doesn't render before a request has actually
    // come back (only once it resolves does `hasRequested` flip and "unavailable" show).
    mockedUseCameraPermissions.mockReturnValue([null, jest.fn(() => new Promise(() => {}))]);
    const screen = await render(<QRScanner active onCode={jest.fn()} />);
    expect(screen.queryByText('Camera preview is unavailable.')).toBeNull();
    expect(screen.getByTestId('qr-scanner-placeholder')).toBeTruthy();
  });

  it('active + denied after a request: shows the "unavailable" card', async () => {
    mockedUseCameraPermissions.mockReturnValue([
      { granted: false, status: 'denied' },
      jest.fn(async () => ({ granted: false, status: 'denied' })),
    ]);
    const screen = await render(<QRScanner active onCode={jest.fn()} />);
    expect(screen.getByText('Camera preview is unavailable.')).toBeTruthy();
    expect(screen.queryByTestId('qr-scanner')).toBeNull();
  });

  it('requests permission once when active and not yet granted', async () => {
    const request = jest.fn(async () => ({ granted: false, status: 'denied' }));
    mockedUseCameraPermissions.mockReturnValue([{ granted: false, status: 'denied' }, request]);
    await render(<QRScanner active onCode={jest.fn()} />);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('becoming active mounts the camera and requests permission; going inactive unmounts it', async () => {
    const request = jest.fn(async () => ({ granted: true, status: 'granted' }));
    mockedUseCameraPermissions.mockReturnValue([{ granted: true, status: 'granted' }, request]);
    const screen = await render(<QRScanner active={false} onCode={jest.fn()} />);
    expect(screen.queryByTestId('qr-scanner')).toBeNull();

    await screen.rerender(<QRScanner active onCode={jest.fn()} />);
    expect(screen.getByTestId('qr-scanner')).toBeTruthy();

    await screen.rerender(<QRScanner active={false} onCode={jest.fn()} />);
    expect(screen.queryByTestId('qr-scanner')).toBeNull();
  });

  it('delivers a scanned code when active', async () => {
    const onCode = jest.fn();
    const screen = await render(<QRScanner active onCode={onCode} />);
    const camera = screen.getByTestId('qr-scanner');
    camera.props.onBarcodeScanned({ type: 'qr', data: 'ABC123', cornerPoints: [], bounds: {} });
    expect(onCode).toHaveBeenCalledWith('ABC123');
  });

  it('dedupes repeat delivery of the same code within the cooldown window', async () => {
    jest.useFakeTimers();
    const onCode = jest.fn();
    const screen = await render(<QRScanner active onCode={onCode} cooldownMs={1000} />);
    const camera = screen.getByTestId('qr-scanner');
    const scan = () =>
      camera.props.onBarcodeScanned({ type: 'qr', data: 'ABC123', cornerPoints: [], bounds: {} });

    scan();
    scan();
    expect(onCode).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    scan();
    expect(onCode).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('does not dedupe a different code scanned immediately after', async () => {
    const onCode = jest.fn();
    const screen = await render(<QRScanner active onCode={onCode} />);
    const camera = screen.getByTestId('qr-scanner');
    camera.props.onBarcodeScanned({ type: 'qr', data: 'ABC123', cornerPoints: [], bounds: {} });
    camera.props.onBarcodeScanned({ type: 'qr', data: 'XYZ789', cornerPoints: [], bounds: {} });
    expect(onCode).toHaveBeenCalledTimes(2);
  });
});

describe('pickQrFromPhoto', () => {
  it('returns cancelled when the picker is dismissed without a photo', async () => {
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    await expect(pickQrFromPhoto()).resolves.toEqual({ kind: 'cancelled' });
    expect(mockedScanFromURLAsync).not.toHaveBeenCalled();
  });

  it('scans the first QR code found in the picked photo', async () => {
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg' }],
    });
    mockedScanFromURLAsync.mockResolvedValueOnce([
      { type: 'qr', data: 'ABC123', cornerPoints: [], bounds: {} },
      { type: 'qr', data: 'IGNORED', cornerPoints: [], bounds: {} },
    ]);
    await expect(pickQrFromPhoto()).resolves.toEqual({ kind: 'scanned', value: 'ABC123' });
    expect(mockedScanFromURLAsync).toHaveBeenCalledWith('file:///picked.jpg', ['qr']);
  });

  it('returns noCode when the photo has no QR code', async () => {
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg' }],
    });
    mockedScanFromURLAsync.mockResolvedValueOnce([]);
    await expect(pickQrFromPhoto()).resolves.toEqual({ kind: 'noCode' });
  });

  it('returns noCode when the image cannot be decoded at all', async () => {
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg' }],
    });
    mockedScanFromURLAsync.mockRejectedValueOnce(new Error('could not read image'));
    await expect(pickQrFromPhoto()).resolves.toEqual({ kind: 'noCode' });
  });
});
