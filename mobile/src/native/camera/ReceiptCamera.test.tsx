import { act, fireEvent, render } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import { AppState, Linking } from 'react-native';
import { ReceiptCamera } from './ReceiptCamera';
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (s: string) => s }) }));
jest.mock('@/i18n', () => ({ useAppLanguage: jest.fn() }));
const request = jest.fn(async () => ({ granted: false }));
const props = { active: true, canCapture: () => true, onPhoto: jest.fn(), onError: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useCameraPermissions)
    .mockReturnValue([{ granted: true, canAskAgain: true }, request] as unknown as ReturnType<
      typeof useCameraPermissions
    >);
});
it('does not mount a camera or request permission when inactive', async () => {
  const view = await render(<ReceiptCamera {...props} active={false} />);
  expect(view.getByTestId('receipt-lens')).toBeTruthy();
  expect(view.queryByTestId('receipt-camera')).toBeNull();
  expect(request).not.toHaveBeenCalled();
});
it('requests camera permission and redirects permanently denied capture to Settings', async () => {
  jest
    .mocked(useCameraPermissions)
    .mockReturnValue([{ granted: false, canAskAgain: false }, request] as unknown as ReturnType<
      typeof useCameraPermissions
    >);
  jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  const view = await render(<ReceiptCamera {...props} />);
  expect(request).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByLabelText('Capture receipt'));
  expect(Linking.openSettings).toHaveBeenCalledTimes(1);
});
it('delivers selected library photos, ignores cancel, and guards offline actions', async () => {
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'photo.jpg', width: 200, height: 300 }],
    } as ImagePicker.ImagePickerResult);
  const view = await render(<ReceiptCamera {...props} />);
  await fireEvent.press(view.getByLabelText('Photo library'));
  expect(props.onPhoto).toHaveBeenCalledWith({ uri: 'photo.jpg', width: 200, height: 300 });
  await fireEvent.press(view.getByLabelText('Photo library'));
  expect(props.onPhoto).toHaveBeenCalledTimes(1);
  await view.rerender(<ReceiptCamera {...props} canCapture={() => false} />);
  await fireEvent.press(view.getByLabelText('Photo library'));
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(2);
});
it('cleans up app-state subscription on unmount', async () => {
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove });
  const view = await render(<ReceiptCamera {...props} />);
  await act(() => view.unmount());
  expect(remove).toHaveBeenCalled();
});

it('switches the front camera with mirrored capture and releases it when inactive', async () => {
  const view = await render(<ReceiptCamera {...props} />);
  expect(view.getByTestId('receipt-camera').props.facing).toBe('back');
  expect(view.getByTestId('receipt-camera').props.mirror).toBe(false);
  await fireEvent.press(view.getByLabelText('Flip camera'));
  expect(view.getByTestId('receipt-camera').props.facing).toBe('front');
  expect(view.getByTestId('receipt-camera').props.mirror).toBe(true);
  await view.rerender(<ReceiptCamera {...props} active={false} />);
  expect(view.queryByTestId('receipt-camera')).toBeNull();
});
it('keeps the shutter inert until the camera reports ready, and again after a flip', async () => {
  const view = await render(<ReceiptCamera {...props} />);
  const shutter = () => view.getByLabelText('Capture receipt');
  expect(shutter().props.accessibilityState?.disabled).toBe(true);
  await act(async () => view.getByTestId('receipt-camera').props.onCameraReady());
  expect(shutter().props.accessibilityState?.disabled).toBe(false);
  await fireEvent.press(view.getByLabelText('Flip camera'));
  expect(shutter().props.accessibilityState?.disabled).toBe(true);
});
it('shows the receipt placeholder until the camera reports ready', async () => {
  const view = await render(<ReceiptCamera {...props} />);
  expect(view.getByTestId('receipt-placeholder')).toBeTruthy();
  await act(async () => view.getByTestId('receipt-camera').props.onCameraReady());
  expect(view.queryByTestId('receipt-placeholder')).toBeNull();
});
it('never mounts a camera on a simulator and keeps the placeholder', async () => {
  jest.replaceProperty(Device, 'isDevice', false);
  const view = await render(<ReceiptCamera {...props} />);
  expect(view.queryByTestId('receipt-camera')).toBeNull();
  expect(view.getByTestId('receipt-placeholder')).toBeTruthy();
});
