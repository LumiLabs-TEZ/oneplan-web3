/**
 * Port of `ios/OnePlan/OnePlanTests/VietQRDecoderTests.swift` (branch
 * `feat/web3-version`), 1:1 plus edge cases the Swift suite never exercised
 * (see bottom section).
 */
import { decodeVietQr, VietQrDecodeError } from './vietqr';

/** Builds an EMVCo TLV string: two digit tag, two digit length, then the value. */
function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, '0') + value;
}

function buildQR(opts: {
  bankBin: string;
  account: string;
  amount?: string;
  description?: string;
  omitCurrency?: boolean;
}): string {
  const { bankBin, account, amount, description, omitCurrency } = opts;
  const merchant =
    tlv('00', 'A000000727') + tlv('01', tlv('00', bankBin) + tlv('01', account)) + tlv('02', 'QRIBFTTA');
  let body = tlv('00', '01') + tlv('01', amount === undefined ? '11' : '12') + tlv('38', merchant);
  if (!omitCurrency) body += tlv('53', '704');
  if (amount !== undefined) body += tlv('54', amount);
  body += tlv('58', 'VN');
  if (description !== undefined) body += tlv('62', tlv('08', description));
  return body + tlv('63', 'ABCD');
}

function expectVietQrError(fn: () => unknown, kind: VietQrDecodeError['kind']): void {
  try {
    fn();
    throw new Error('expected decodeVietQr to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(VietQrDecodeError);
    expect((err as VietQrDecodeError).kind).toBe(kind);
  }
}

describe('VietQRDecoder', () => {
  it('extracts bank bin and account from a static code', () => {
    const decoded = decodeVietQr(buildQR({ bankBin: '970412', account: '109000636588' }));
    expect(decoded.bankBin).toBe('970412');
    expect(decoded.accountNumber).toBe('109000636588');
    expect(decoded.amountVnd).toBeNull();
  });

  it('extracts the amount from a dynamic code', () => {
    const decoded = decodeVietQr(
      buildQR({ bankBin: '970407', account: '19036045678901', amount: '200000' }),
    );
    expect(decoded.amountVnd).toBe(200_000n);
  });

  it('tolerates a trailing decimal on the amount', () => {
    const decoded = decodeVietQr(
      buildQR({ bankBin: '970407', account: '1903604', amount: '200000.00' }),
    );
    expect(decoded.amountVnd).toBe(200_000n);
  });

  it('extracts the description when present', () => {
    const decoded = decodeVietQr(
      buildQR({ bankBin: '970436', account: '1234567890', description: 'Chuyen tien' }),
    );
    expect(decoded.description).toBe('Chuyen tien');
  });

  it('rejects a payload with no merchant account field', () => {
    const qr = tlv('00', '01') + tlv('53', '704') + tlv('63', 'ABCD');
    expectVietQrError(() => decodeVietQr(qr), 'missingMerchantAccount');
  });

  it('rejects a currency other than VND', () => {
    const qr = buildQR({ bankBin: '970412', account: '1234' }).replace(tlv('53', '704'), tlv('53', '840'));
    expectVietQrError(() => decodeVietQr(qr), 'unsupportedCurrency');
  });

  it('rejects a truncated payload', () => {
    expectVietQrError(() => decodeVietQr('0002015802'), 'truncated');
  });

  it('rejects an empty payload', () => {
    expectVietQrError(() => decodeVietQr(''), 'empty');
  });

  it('rejects a non-numeric length field', () => {
    expectVietQrError(() => decodeVietQr('00XX01'), 'badLength');
  });

  // --- Edge cases not in the Swift suite ---

  it('accepts a code with no currency tag at all (currency check is opt-in, not required)', () => {
    const decoded = decodeVietQr(
      buildQR({ bankBin: '970412', account: '109000636588', omitCurrency: true }),
    );
    expect(decoded.bankBin).toBe('970412');
  });

  it('rejects a merchant account missing the beneficiary sub-field', () => {
    // Tag 38 present, but only the acquirer id sub-tag (00) — no beneficiary (01).
    const merchant = tlv('00', 'A000000727');
    const qr = tlv('00', '01') + tlv('01', '11') + tlv('38', merchant) + tlv('53', '704') + tlv('63', 'ABCD');
    expectVietQrError(() => decodeVietQr(qr), 'missingBeneficiary');
  });

  it('rejects a beneficiary with a bank bin but no account number', () => {
    const beneficiary = tlv('00', '970412'); // sub-tag 01 (account) is missing
    const merchant = tlv('01', beneficiary);
    const qr = tlv('00', '01') + tlv('01', '11') + tlv('38', merchant) + tlv('53', '704') + tlv('63', 'ABCD');
    expectVietQrError(() => decodeVietQr(qr), 'missingAccount');
  });

  it('rejects an amount with non-numeric text after the decimal point (matches the server exactly)', () => {
    // Fixed vs Swift: the original only validated the portion of the amount
    // string before the first "."; anything after — even garbage — was
    // silently discarded. This client now applies the server's own rule
    // (`payout/vietqr.ts` on `feat/web3-version`: `/^\d+(\.\d+)?$/`) so the
    // two never disagree on whether a scanned amount is valid.
    const decode = () =>
      decodeVietQr(buildQR({ bankBin: '970407', account: '1903604', amount: '200000.notanumber' }));
    expectVietQrError(decode, 'badAmount');
  });

  it('rejects a bare trailing decimal point with no fractional digits', () => {
    // "200000." — accepted under the old Swift-ported quirk, rejected by the
    // server's regex (no digits after "."), and now rejected here too.
    const decode = () =>
      decodeVietQr(buildQR({ bankBin: '970407', account: '1903604', amount: '200000.' }));
    expectVietQrError(decode, 'badAmount');
  });

  it('rejects an amount that is entirely a decimal point', () => {
    const decoded = () =>
      decodeVietQr(buildQR({ bankBin: '970407', account: '1903604', amount: '.' }));
    expectVietQrError(decoded, 'badAmount');
  });

  it('returns a null description when tag 62 is present but its sub-tag 08 is missing', () => {
    const additional = tlv('01', 'something-else');
    const qr =
      tlv('00', '01') +
      tlv('01', '11') +
      tlv(
        '38',
        tlv('00', 'A000000727') + tlv('01', tlv('00', '970412') + tlv('01', '109000636588')) + tlv('02', 'QRIBFTTA'),
      ) +
      tlv('53', '704') +
      tlv('58', 'VN') +
      tlv('62', additional) +
      tlv('63', 'ABCD');
    const decoded = decodeVietQr(qr);
    expect(decoded.description).toBeNull();
  });

  it('propagates a truncated error from a malformed nested tag-62 payload', () => {
    // The outer tag-62 TLV is well-formed (its declared length matches what
    // follows), but the sub-TLV it wraps ("0810": sub-tag 08, length 10)
    // declares more bytes than it actually has. The nested `parseTlv` call
    // must surface that, not just the outer one.
    const qr = buildQR({ bankBin: '970412', account: '1234' }).replace(tlv('58', 'VN'), tlv('58', 'VN') + tlv('62', '0810'));
    expectVietQrError(() => decodeVietQr(qr), 'truncated');
  });
});
