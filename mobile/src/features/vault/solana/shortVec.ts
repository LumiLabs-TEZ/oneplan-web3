/**
 * Port of `ios/OnePlan/OnePlan/Services/Solana/ShortVec.swift` (branch
 * `feat/web3-version`) — Solana's compact-u16: seven bits of payload per byte,
 * high bit set while more bytes follow, at most three bytes. `transactionVerifier`
 * uses it to walk the wire format of a legacy transaction.
 */

export type SolanaDecodeErrorKind =
  | 'truncated'
  | 'unsupportedVersion'
  | 'malformedLength'
  | 'unexpectedProgram'
  | 'accountIndexOutOfRange'
  | 'instructionCountMismatch'
  | 'discriminatorMismatch'
  | 'argumentMismatch';

/** Mirrors Swift's `SolanaDecodeError` enum (`argumentMismatch` carries `field`). */
export class SolanaDecodeError extends Error {
  readonly kind: SolanaDecodeErrorKind;
  readonly field?: string;

  // Not private: Jest's `.toThrow(SolanaDecodeError)` needs a public construct
  // signature to type-check. Construct via the static factories below.
  constructor(kind: SolanaDecodeErrorKind, field?: string) {
    super(field !== undefined ? `${kind}: ${field}` : kind);
    this.name = 'SolanaDecodeError';
    this.kind = kind;
    this.field = field;
  }

  static truncated(): SolanaDecodeError {
    return new SolanaDecodeError('truncated');
  }
  static unsupportedVersion(): SolanaDecodeError {
    return new SolanaDecodeError('unsupportedVersion');
  }
  static malformedLength(): SolanaDecodeError {
    return new SolanaDecodeError('malformedLength');
  }
  static unexpectedProgram(): SolanaDecodeError {
    return new SolanaDecodeError('unexpectedProgram');
  }
  static accountIndexOutOfRange(): SolanaDecodeError {
    return new SolanaDecodeError('accountIndexOutOfRange');
  }
  static instructionCountMismatch(): SolanaDecodeError {
    return new SolanaDecodeError('instructionCountMismatch');
  }
  static discriminatorMismatch(): SolanaDecodeError {
    return new SolanaDecodeError('discriminatorMismatch');
  }
  static argumentMismatch(field: string): SolanaDecodeError {
    return new SolanaDecodeError('argumentMismatch', field);
  }
}

export interface ShortVecResult {
  value: number;
  /** Offset immediately after the bytes this call consumed. */
  offset: number;
}

/**
 * Decodes one compact-u16 starting at `offset`. Swift's version takes `offset`
 * as `inout`; this returns the advanced offset instead since TS has no by-ref
 * primitives.
 */
export function decodeShortVec(bytes: Uint8Array, offset: number): ShortVecResult {
  let value = 0;
  let shift = 0;
  let index = offset;

  for (;;) {
    if (index >= bytes.length) throw SolanaDecodeError.truncated();
    const byte = bytes[index] as number;
    index += 1;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 14) throw SolanaDecodeError.malformedLength();
  }

  return { value, offset: index };
}
