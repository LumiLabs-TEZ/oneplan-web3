import { mergeWalletSignatures } from './signatureSlots';

/** [count=2][sig0 64B][sig1 64B][message...] — the legacy wire layout, short-vec count < 128. */
function tx(sig0: number, sig1: number, message: number[]): Uint8Array {
  return Uint8Array.from([2, ...new Array(64).fill(sig0), ...new Array(64).fill(sig1), ...message]);
}

describe('mergeWalletSignatures', () => {
  it('keeps the wallet signature and restores a fee-payer signature the wallet zeroed', () => {
    const original = tx(7, 0, [1, 2, 3]);
    const signed = tx(0, 9, [1, 2, 3]);
    expect(Array.from(mergeWalletSignatures(original, signed))).toEqual(Array.from(tx(7, 9, [1, 2, 3])));
  });

  it('passes through a wallet that preserved every signature', () => {
    const signed = tx(7, 9, [1, 2, 3]);
    expect(mergeWalletSignatures(tx(7, 0, [1, 2, 3]), signed)).toEqual(signed);
  });

  it('rejects a wallet that changed the message', () => {
    expect(() => mergeWalletSignatures(tx(7, 0, [1, 2, 3]), tx(7, 9, [1, 2, 4]))).toThrow('message_changed');
  });

  it('rejects a different signer count', () => {
    const one = Uint8Array.from([1, ...new Array(64).fill(9), 1, 2, 3]);
    expect(() => mergeWalletSignatures(tx(7, 0, [1, 2, 3]), one)).toThrow('signature_count_changed');
  });
});
