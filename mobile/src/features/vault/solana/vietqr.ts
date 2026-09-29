/**
 * Port of `ios/OnePlan/OnePlan/Services/Solana/VietQRDecoder.swift` (branch
 * `feat/web3-version`) — minimal EMVCo QR decoder for VietQR.
 *
 * The format is a flat sequence of tag-length-value triples: a two digit tag,
 * a two digit decimal length, then that many characters. Tags 38 and 62 nest
 * another TLV sequence inside their value.
 *
 * Decoding happens on device: a scanned code is parsed here and only the
 * fields we understand are sent to the server, so an unrecognised payload
 * never leaves the phone.
 *
 * Most merchant codes are static and carry no amount, which is why the
 * payment flow asks the user to type one.
 */

export type VietQrDecodeErrorKind =
  | 'empty'
  | 'truncated'
  | 'badLength'
  | 'missingMerchantAccount'
  | 'missingBeneficiary'
  | 'missingAccount'
  | 'unsupportedCurrency'
  | 'badAmount';

/** Mirrors Swift's `VietQRDecodeError` enum (some cases carry the offending raw string). */
export class VietQrDecodeError extends Error {
  readonly kind: VietQrDecodeErrorKind;
  readonly detail?: string;

  // Not private: `.toThrow(VietQrDecodeError)` needs a public construct signature.
  // Construct via the static factories below.
  constructor(kind: VietQrDecodeErrorKind, detail?: string) {
    super(detail !== undefined ? `${kind}: ${detail}` : kind);
    this.name = 'VietQrDecodeError';
    this.kind = kind;
    this.detail = detail;
  }

  static empty(): VietQrDecodeError {
    return new VietQrDecodeError('empty');
  }
  static truncated(): VietQrDecodeError {
    return new VietQrDecodeError('truncated');
  }
  static badLength(raw: string): VietQrDecodeError {
    return new VietQrDecodeError('badLength', raw);
  }
  static missingMerchantAccount(): VietQrDecodeError {
    return new VietQrDecodeError('missingMerchantAccount');
  }
  static missingBeneficiary(): VietQrDecodeError {
    return new VietQrDecodeError('missingBeneficiary');
  }
  static missingAccount(): VietQrDecodeError {
    return new VietQrDecodeError('missingAccount');
  }
  static unsupportedCurrency(currency: string): VietQrDecodeError {
    return new VietQrDecodeError('unsupportedCurrency', currency);
  }
  static badAmount(raw: string): VietQrDecodeError {
    return new VietQrDecodeError('badAmount', raw);
  }
}

export interface VietQrPayload {
  bankBin: string;
  accountNumber: string;
  amountVnd: bigint | null;
  description: string | null;
}

const TAG_MERCHANT_ACCOUNT = '38';
const TAG_CURRENCY = '53';
const TAG_AMOUNT = '54';
const TAG_ADDITIONAL = '62';
const SUB_TAG_BANK_BIN = '00';
const SUB_TAG_ACCOUNT = '01';
const SUB_TAG_BENEFICIARY = '01';
const SUB_TAG_DESCRIPTION = '08';
const CURRENCY_VND = '704';

function parseTlv(input: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;

  while (i < input.length) {
    if (i + 4 > input.length) throw VietQrDecodeError.truncated();
    const tag = input.slice(i, i + 2);
    const rawLength = input.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(rawLength)) throw VietQrDecodeError.badLength(rawLength);
    const length = Number(rawLength);
    const start = i + 4;
    const end = start + length;
    if (end > input.length) throw VietQrDecodeError.truncated();
    out.set(tag, input.slice(start, end));
    i = end;
  }

  return out;
}

/**
 * Matches `server/src/payout/vietqr.ts` (`decodeVietQr`) on `feat/web3-version`
 * exactly: an integer, optionally followed by "." and one-or-more digits.
 * Intentional divergence from the Swift original, which only validated the
 * portion before the first "." and silently discarded the rest — see README
 * "Fixed vs Swift".
 */
const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

export function decodeVietQr(payload: string): VietQrPayload {
  if (payload.length === 0) throw VietQrDecodeError.empty();

  const root = parseTlv(payload);

  const currency = root.get(TAG_CURRENCY);
  if (currency !== undefined && currency !== CURRENCY_VND) {
    throw VietQrDecodeError.unsupportedCurrency(currency);
  }

  const merchant = root.get(TAG_MERCHANT_ACCOUNT);
  if (merchant === undefined) throw VietQrDecodeError.missingMerchantAccount();

  const beneficiary = parseTlv(merchant).get(SUB_TAG_BENEFICIARY);
  if (beneficiary === undefined) throw VietQrDecodeError.missingBeneficiary();

  const fields = parseTlv(beneficiary);
  const bankBin = fields.get(SUB_TAG_BANK_BIN);
  const accountNumber = fields.get(SUB_TAG_ACCOUNT);
  if (bankBin === undefined || accountNumber === undefined) {
    throw VietQrDecodeError.missingAccount();
  }

  let amountVnd: bigint | null = null;
  const rawAmount = root.get(TAG_AMOUNT);
  if (rawAmount !== undefined) {
    if (!AMOUNT_PATTERN.test(rawAmount)) {
      throw VietQrDecodeError.badAmount(rawAmount);
    }
    // VND has no minor units; a trailing ".00" is tolerated and truncated.
    // `AMOUNT_PATTERN` guarantees a "." (if any) is followed by digits, so
    // the integer part always exists.
    const whole = rawAmount.split('.')[0] as string;
    amountVnd = BigInt(whole);
  }

  let description: string | null = null;
  const additional = root.get(TAG_ADDITIONAL);
  if (additional !== undefined) {
    description = parseTlv(additional).get(SUB_TAG_DESCRIPTION) ?? null;
  }

  return { bankBin, accountNumber, amountVnd, description };
}
