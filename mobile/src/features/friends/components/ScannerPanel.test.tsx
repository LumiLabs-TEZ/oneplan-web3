import { render } from '@testing-library/react-native';

import { ScannerPanel } from './ScannerPanel';

describe('ScannerPanel', () => {
  it('sizes the panel from the `size` prop', async () => {
    const screen = await render(<ScannerPanel active size={280} onCode={jest.fn()} />);
    const panel = screen.getByTestId('qr-scanner-panel');
    const flatStyle = Object.assign({}, ...[panel.props.style].flat());
    expect(flatStyle.width).toBe(280);
    expect(flatStyle.height).toBe(280);
  });

  it('forwards `active` to the underlying QRScanner (scanning enabled)', async () => {
    const screen = await render(<ScannerPanel active size={280} onCode={jest.fn()} />);
    const camera = screen.getByTestId('qr-scanner');
    expect(camera.props.onBarcodeScanned).toBeDefined();
  });

  it('does not mount the camera when inactive', async () => {
    const screen = await render(<ScannerPanel active={false} size={280} onCode={jest.fn()} />);
    expect(screen.queryByTestId('qr-scanner')).toBeNull();
  });
});
