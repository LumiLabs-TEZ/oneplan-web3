/**
 * Port of `ios/OnePlan/OnePlanTests/ShortVecTests.swift` (branch
 * `feat/web3-version`), 1:1 plus one edge case (see bottom) the Swift suite
 * never exercised.
 */
import { decodeShortVec, SolanaDecodeError } from './shortVec';

describe('ShortVec compact-u16', () => {
  it('single byte values decode as themselves', () => {
    expect(decodeShortVec(new Uint8Array([0x00]), 0)).toEqual({ value: 0, offset: 1 });
    expect(decodeShortVec(new Uint8Array([0x7f]), 0)).toEqual({ value: 127, offset: 1 });
  });

  it('two byte values decode across the continuation bit', () => {
    expect(decodeShortVec(new Uint8Array([0x80, 0x01]), 0)).toEqual({ value: 128, offset: 2 });
    expect(decodeShortVec(new Uint8Array([0xff, 0x7f]), 0)).toEqual({
      value: 16383,
      offset: 2,
    });
  });

  it('three byte values decode', () => {
    expect(decodeShortVec(new Uint8Array([0x80, 0x80, 0x01]), 0)).toEqual({
      value: 16384,
      offset: 3,
    });
  });

  it('decoding continues from the given offset', () => {
    expect(decodeShortVec(new Uint8Array([0xaa, 0xbb, 0x05]), 2)).toEqual({
      value: 5,
      offset: 3,
    });
  });

  it('running off the end throws', () => {
    expect(() => decodeShortVec(new Uint8Array([0x80]), 0)).toThrow(SolanaDecodeError);
    try {
      decodeShortVec(new Uint8Array([0x80]), 0);
    } catch (err) {
      expect((err as SolanaDecodeError).kind).toBe('truncated');
    }
  });

  it('an empty buffer throws', () => {
    expect(() => decodeShortVec(new Uint8Array([]), 0)).toThrow(SolanaDecodeError);
    try {
      decodeShortVec(new Uint8Array([]), 0);
    } catch (err) {
      expect((err as SolanaDecodeError).kind).toBe('truncated');
    }
  });

  // Not in the Swift suite: three continuation-bit bytes in a row push
  // `shift` past 14 before a fourth byte is even read, so this is
  // `malformedLength`, not `truncated` — the only path in ShortVec.swift the
  // original tests never reached.
  it('a fourth continuation byte would be required throws malformedLength', () => {
    try {
      decodeShortVec(new Uint8Array([0x80, 0x80, 0x80]), 0);
      throw new Error('expected decodeShortVec to throw');
    } catch (err) {
      expect((err as SolanaDecodeError).kind).toBe('malformedLength');
    }
  });
});
