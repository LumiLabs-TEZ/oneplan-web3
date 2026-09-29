/**
 * Minimal standard-alphabet base64 codec.
 *
 * React Native/Hermes has no built-in `atob`/`btoa`, and this module must run
 * on-device (not just in Jest, where Node's globals would paper over it) to
 * decode server-built transactions before `transactionVerifier` checks them.
 * Written by hand instead of adding a dependency for ~40 lines of bit shifting.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CHAR_TO_SEXTET: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i += 1) {
  CHAR_TO_SEXTET[ALPHABET[i] as string] = i;
}

/** Throws on malformed input (wrong length, characters outside the base64 alphabet/padding). */
export function base64Decode(input: string): Uint8Array {
  const sanitized = input.replace(/\s/g, '');
  if (sanitized.length === 0) return new Uint8Array(0);
  if (sanitized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(sanitized)) {
    throw new Error('invalid base64 input');
  }

  const withoutPadding = sanitized.replace(/=+$/, '');
  const byteLength = Math.floor((withoutPadding.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);

  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;
  for (const char of withoutPadding) {
    bitBuffer = (bitBuffer << 6) | (CHAR_TO_SEXTET[char] as number);
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[byteIndex] = (bitBuffer >> bitCount) & 0xff;
      byteIndex += 1;
    }
  }

  return bytes;
}

/** Used by tests to build fixture transactions the same way the Swift suite builds `Data`. */
export function base64Encode(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1] as number;
    const b2 = bytes[i + 2] as number;
    result +=
      ALPHABET.charAt(b0 >> 2) +
      ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4)) +
      ALPHABET.charAt(((b1 & 0x0f) << 2) | (b2 >> 6)) +
      ALPHABET.charAt(b2 & 0x3f);
  }

  const remaining = bytes.length - i;
  if (remaining === 1) {
    const b0 = bytes[i] as number;
    result += ALPHABET.charAt(b0 >> 2) + ALPHABET.charAt((b0 & 0x03) << 4) + '==';
  } else if (remaining === 2) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1] as number;
    result +=
      ALPHABET.charAt(b0 >> 2) +
      ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4)) +
      ALPHABET.charAt((b1 & 0x0f) << 2) +
      '=';
  }

  return result;
}
