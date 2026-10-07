/**
 * Integration check for the scan → amount handoff the acceptance criteria calls out explicitly:
 * a VietQR code that carries an amount (`decodeVietQr().amountVnd`) must prefill
 * `VaultPayAmountScreen`, not just decode correctly in isolation (already covered by
 * `VaultScanQRScreen.test.tsx` and `VaultPayAmountScreen.test.tsx` separately).
 */
import { act, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { VaultPayAmountScreen } from './VaultPayAmountScreen';
import { VaultScanQRScreen } from './VaultScanQRScreen';
import type { VietQrPayload } from '../solana/vietqr';

// Rendered without a SafeAreaProvider; the screen reads the top inset for its header.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/** Tag 38 (merchant, bank BIN 970422 / account 123456) + tag 54 amount "150000". */
function buildVietQrPayloadWithAmount(): string {
  const beneficiary = '00' + '06' + '970422' + '01' + '06' + '123456';
  const merchant = '01' + String(beneficiary.length).padStart(2, '0') + beneficiary;
  const merchantTlv = '38' + String(merchant.length).padStart(2, '0') + merchant;
  const amountTlv = '54' + '06' + '150000';
  return merchantTlv + amountTlv;
}

function Harness() {
  const [decoded, setDecoded] = useState<VietQrPayload | null>(null);
  if (!decoded) {
    return (
      <VaultScanQRScreen
        onScanned={(payload) => setDecoded(payload)}
        onCancel={jest.fn()}
      />
    );
  }
  return (
    <VaultPayAmountScreen
      recipientName="Nguyen Van A"
      balanceVnd={5_000_000}
      prefilledAmountVnd={decoded.amountVnd}
      indicativeRate={26_500}
      onBack={jest.fn()}
      onNext={jest.fn()}
    />
  );
}

// Under a full-suite run this mounts two heavy screens on a busy worker (M12: a bare
// `findByTestId` with RNTL's default 1 s wait, then a 5 s one, both flaked). The scan callback
// runs inside `act`, the wait is a generous `waitFor`, and the test gets a matching Jest timeout.
const LOAD_TOLERANT_MS = 20_000;

describe('VietQR scan → amount prefill', () => {
  it(
    'a QR-carried amount survives the handoff into the amount screen keypad',
    async () => {
      const screen = await render(<Harness />);
      const camera = screen.getByTestId('qr-scanner');
      await act(async () => {
        camera.props.onBarcodeScanned({ data: buildVietQrPayloadWithAmount() });
      });

      await waitFor(
        () => expect(screen.getByTestId('vault-pay-amount-display')).toHaveTextContent('150,000'),
        { timeout: LOAD_TOLERANT_MS - 5_000 },
      );
    },
    LOAD_TOLERANT_MS,
  );
});
