/**
 * Port of the scan/reject/photo-picker behaviours in `VaultScanQRView.swift` (`feat/web3-version`).
 */
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { scanFromURLAsync, useCameraPermissions } from 'expo-camera';

import { VaultScanQRScreen } from './VaultScanQRScreen';

// Rendered without a SafeAreaProvider; the screen reads the top inset for its header.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockedLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockedScanFromURLAsync = scanFromURLAsync as jest.Mock;

/** A minimal valid VietQR payload: tag 38 (merchant account) → sub-tag 01 (beneficiary) → tags
 * 00 (bank BIN "970422") + 01 (account "123456"). */
function buildValidVietQrPayload(): string {
  const beneficiary = '00' + '06' + '970422' + '01' + '06' + '123456';
  const merchant = '01' + String(beneficiary.length).padStart(2, '0') + beneficiary;
  return '38' + String(merchant.length).padStart(2, '0') + merchant;
}
const VALID_PAYLOAD = buildValidVietQrPayload();

describe('VaultScanQRScreen', () => {
  beforeEach(() => {
    mockedLaunchImageLibraryAsync.mockReset().mockResolvedValue({ canceled: true, assets: null });
    mockedScanFromURLAsync.mockReset().mockResolvedValue([]);
  });

  it('decodes a valid VietQR camera scan and calls onScanned', async () => {
    const onScanned = jest.fn();
    const screen = await render(<VaultScanQRScreen onScanned={onScanned} onCancel={jest.fn()} />);
    const camera = screen.getByTestId('qr-scanner');
    camera.props.onBarcodeScanned({ data: VALID_PAYLOAD });

    expect(onScanned).toHaveBeenCalledTimes(1);
    const [decoded, raw] = onScanned.mock.calls[0]!;
    expect(decoded).toEqual({
      bankBin: '970422',
      accountNumber: '123456',
      amountVnd: null,
      description: null,
    });
    expect(raw).toBe(VALID_PAYLOAD);
  });

  it('rejects a non-VietQR code, shows the toast, and keeps scanning', async () => {
    const onScanned = jest.fn();
    const screen = await render(<VaultScanQRScreen onScanned={onScanned} onCancel={jest.fn()} />);
    const camera = screen.getByTestId('qr-scanner');
    camera.props.onBarcodeScanned({ data: 'not-a-vietqr-code' });

    expect(onScanned).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('vault-scan-qr-rejected')).toBeTruthy());
    expect(screen.getByText('That is not a Vietnamese payment code')).toBeTruthy();
    // Camera stays mounted — the screen does not close on a rejected scan.
    expect(screen.getByTestId('qr-scanner')).toBeTruthy();
  });

  it('calls onCancel from the back button', async () => {
    const onCancel = jest.fn();
    const screen = await render(<VaultScanQRScreen onScanned={jest.fn()} onCancel={onCancel} />);
    fireEvent.press(screen.getByTestId('vault-scan-qr-back'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('photo picker: decodes a picked photo and calls onScanned', async () => {
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg' }],
    });
    mockedScanFromURLAsync.mockResolvedValueOnce([{ data: VALID_PAYLOAD }]);

    const onScanned = jest.fn();
    const screen = await render(<VaultScanQRScreen onScanned={onScanned} onCancel={jest.fn()} />);
    fireEvent.press(screen.getByTestId('vault-scan-qr-photo-picker'));

    await waitFor(() => expect(onScanned).toHaveBeenCalledTimes(1));
  });

  it('photo picker: shows "No QR code in that image" when the photo has none', async () => {
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg' }],
    });
    mockedScanFromURLAsync.mockResolvedValueOnce([]);

    const screen = await render(<VaultScanQRScreen onScanned={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.press(screen.getByTestId('vault-scan-qr-photo-picker'));

    await waitFor(() => expect(screen.getByText('No QR code in that image')).toBeTruthy());
  });

  it('photo picker: cancelling the picker does not reject or scan', async () => {
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    const onScanned = jest.fn();
    const screen = await render(<VaultScanQRScreen onScanned={onScanned} onCancel={jest.fn()} />);
    fireEvent.press(screen.getByTestId('vault-scan-qr-photo-picker'));

    await waitFor(() => expect(mockedLaunchImageLibraryAsync).toHaveBeenCalled());
    expect(onScanned).not.toHaveBeenCalled();
    expect(screen.queryByTestId('vault-scan-qr-rejected')).toBeNull();
  });

  it('hides the camera-access hint once permission is granted', async () => {
    const screen = await render(<VaultScanQRScreen onScanned={jest.fn()} onCancel={jest.fn()} />);
    await waitFor(() => expect(screen.queryByTestId('vault-scan-qr-permission-hint')).toBeNull());
  });

  it('shows the camera-access hint inside the frame while permission is denied', async () => {
    const denied = { granted: false, status: 'denied' };
    (useCameraPermissions as jest.Mock).mockReturnValue([denied, jest.fn(async () => denied)]);
    try {
      const screen = await render(
        <VaultScanQRScreen onScanned={jest.fn()} onCancel={jest.fn()} />,
      );
      expect(screen.getByText('Allow camera access, or pick a code from your photos')).toBeTruthy();
      // The scanner's own "unavailable" card would duplicate the hint.
      await waitFor(() => expect(screen.queryByText('Camera preview is unavailable.')).toBeNull());
    } finally {
      (useCameraPermissions as jest.Mock).mockReset().mockImplementation(() => [
        { granted: true, status: 'granted' },
        jest.fn(async () => ({ granted: true, status: 'granted' })),
      ]);
    }
  });
});
