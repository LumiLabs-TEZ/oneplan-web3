/**
 * The server builds every vault transaction with itself as fee payer and signs first; the
 * wallet adds the member's signature. MWA wallets are supposed to keep existing signatures, but
 * nothing forces them to — and some submit paths key the DB row on the first signature in the
 * submitted bytes. So: refill any slot the wallet zeroed from the bytes we sent, and refuse
 * outright if the wallet altered the message (that tx was not the one the verifier approved).
 */
import { decodeShortVec } from '@/features/vault/solana/shortVec';

const SIGNATURE_BYTES = 64;

function split(bytes: Uint8Array) {
  const count = decodeShortVec(bytes, 0);
  const sigStart = count.offset;
  const messageStart = sigStart + count.value * SIGNATURE_BYTES;
  return { count: count.value, sigStart, message: bytes.subarray(messageStart) };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function mergeWalletSignatures(original: Uint8Array, signed: Uint8Array): Uint8Array {
  const before = split(original);
  const after = split(signed);
  if (before.count !== after.count) throw new Error('signature_count_changed');
  if (!sameBytes(before.message, after.message)) throw new Error('message_changed');

  const merged = Uint8Array.from(signed);
  for (let i = 0; i < after.count; i += 1) {
    const at = after.sigStart + i * SIGNATURE_BYTES;
    const slot = merged.subarray(at, at + SIGNATURE_BYTES);
    if (slot.every((b) => b === 0)) {
      const from = before.sigStart + i * SIGNATURE_BYTES;
      merged.set(original.subarray(from, from + SIGNATURE_BYTES), at);
    }
  }
  return merged;
}
