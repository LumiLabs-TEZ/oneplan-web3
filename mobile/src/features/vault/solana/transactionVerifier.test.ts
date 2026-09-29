/**
 * Port of `ios/OnePlan/OnePlanTests/TransactionVerifierTests.swift` (branch
 * `feat/web3-version`), 1:1 plus edge cases the Swift suite never exercised
 * (see bottom section): `accountIndexOutOfRange` is never thrown anywhere in
 * the original suite, and `verify()` is never called with
 * `expectedAmountMicro: null`.
 */
import { base64Decode, base64Encode } from './base64';
import { VAULT_USDC_MINT } from './constants';
import {
  decodeTransaction,
  encodeBase58,
  SPL_TOKEN_PROGRAM_ID,
  verify,
  verifyTokenTransfer,
} from './transactionVerifier';
import { SolanaDecodeError } from './shortVec';

/**
 * Builds a minimal legacy transaction: signature count, blank signatures, a
 * three byte header, the account keys, a blockhash, then one instruction.
 */
function makeTransaction(opts: {
  signerCount?: number;
  accountKeys: Uint8Array[];
  programIndex: number;
  instructionAccounts: number[];
  data: number[];
}): string {
  const signerCount = opts.signerCount ?? 2;
  const bytes: number[] = [];
  bytes.push(signerCount);
  bytes.push(...new Array(64 * signerCount).fill(0));
  bytes.push(signerCount, 0, 1);
  bytes.push(opts.accountKeys.length);
  for (const key of opts.accountKeys) bytes.push(...key);
  bytes.push(...new Array(32).fill(7)); // blockhash
  bytes.push(1); // one instruction
  bytes.push(opts.programIndex);
  bytes.push(opts.instructionAccounts.length);
  bytes.push(...opts.instructionAccounts);
  bytes.push(opts.data.length);
  bytes.push(...opts.data);
  return base64Encode(new Uint8Array(bytes));
}

function key(seed: number): Uint8Array {
  return new Uint8Array(32).fill(seed);
}

/** Anchor instruction data: eight discriminator bytes then borsh arguments. */
const discriminator = [77, 79, 85, 150, 33, 217, 52, 106];

function u64le(value: bigint): number[] {
  const bytes: number[] = [];
  let v = value;
  for (let i = 0; i < 8; i += 1) {
    bytes.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return bytes;
}

function base58(bytes: Uint8Array): string {
  return encodeBase58(bytes);
}

describe('TransactionVerifier', () => {
  it('decodes account keys and one instruction', () => {
    const tx = makeTransaction({
      accountKeys: [key(1), key(2), key(9)],
      programIndex: 2,
      instructionAccounts: [0, 1],
      data: [...discriminator, ...u64le(7_660_000n)],
    });
    const decoded = decodeTransaction(tx);

    expect(decoded.accountKeys).toHaveLength(3);
    expect(decoded.instructions).toHaveLength(1);
    expect(decoded.instructions[0]?.programId).toBe(base58(key(9)));
    expect(decoded.instructions[0]?.data).toHaveLength(16);
  });

  it('accepts a transaction matching the request', () => {
    const tx = makeTransaction({
      accountKeys: [key(1), key(2), key(9)],
      programIndex: 2,
      instructionAccounts: [0, 1],
      data: [...discriminator, ...u64le(7_660_000n)],
    });
    expect(() =>
      verify({
        base64: tx,
        expectedProgramId: base58(key(9)),
        expectedDiscriminator: discriminator,
        expectedAmountMicro: 7_660_000n,
        expectedAccounts: [base58(key(1))],
      }),
    ).not.toThrow();
  });

  it('rejects a tampered amount', () => {
    const tx = makeTransaction({
      accountKeys: [key(1), key(2), key(9)],
      programIndex: 2,
      instructionAccounts: [0, 1],
      data: [...discriminator, ...u64le(999_999_999n)],
    });
    expect(() =>
      verify({
        base64: tx,
        expectedProgramId: base58(key(9)),
        expectedDiscriminator: discriminator,
        expectedAmountMicro: 7_660_000n,
        expectedAccounts: [base58(key(1))],
      }),
    ).toThrow(SolanaDecodeError);
  });

  it('rejects a substituted program', () => {
    const tx = makeTransaction({
      accountKeys: [key(1), key(2), key(3)],
      programIndex: 2,
      instructionAccounts: [0, 1],
      data: [...discriminator, ...u64le(7_660_000n)],
    });
    expect(() =>
      verify({
        base64: tx,
        expectedProgramId: base58(key(9)),
        expectedDiscriminator: discriminator,
        expectedAmountMicro: 7_660_000n,
        expectedAccounts: [],
      }),
    ).toThrow(SolanaDecodeError);
  });

  it('rejects a different instruction', () => {
    const tx = makeTransaction({
      accountKeys: [key(1), key(2), key(9)],
      programIndex: 2,
      instructionAccounts: [0, 1],
      data: [1, 2, 3, 4, 5, 6, 7, 8, ...u64le(7_660_000n)],
    });
    expect(() =>
      verify({
        base64: tx,
        expectedProgramId: base58(key(9)),
        expectedDiscriminator: discriminator,
        expectedAmountMicro: 7_660_000n,
        expectedAccounts: [],
      }),
    ).toThrow(SolanaDecodeError);
  });

  it('rejects a missing expected account', () => {
    const tx = makeTransaction({
      accountKeys: [key(1), key(2), key(9)],
      programIndex: 2,
      instructionAccounts: [0, 1],
      data: [...discriminator, ...u64le(7_660_000n)],
    });
    expect(() =>
      verify({
        base64: tx,
        expectedProgramId: base58(key(9)),
        expectedDiscriminator: discriminator,
        expectedAmountMicro: 7_660_000n,
        expectedAccounts: [base58(key(5))],
      }),
    ).toThrow(SolanaDecodeError);
  });

  it('rejects more than one instruction', () => {
    const tx = makeTransaction({
      accountKeys: [key(1), key(2), key(9)],
      programIndex: 2,
      instructionAccounts: [0, 1],
      data: [...discriminator, ...u64le(7_660_000n)],
    });
    const bytes = base64Decode(tx);
    // Claim two instructions while supplying one.
    const instructionCountIndex = 1 + 64 * 2 + 3 + 1 + 32 * 3 + 32;
    bytes[instructionCountIndex] = 2;
    expect(() => decodeTransaction(base64Encode(bytes))).toThrow(SolanaDecodeError);
  });

  it('rejects a truncated transaction', () => {
    expect(() => decodeTransaction(base64Encode(new Uint8Array([1, 2, 3])))).toThrow(
      SolanaDecodeError,
    );
  });

  // MARK: - SPL transferChecked (personal wallet payments)

  /** `transferChecked` data: tag 12, u64 amount, u8 decimals. */
  function transferData(amount: bigint, decimals = 6): number[] {
    return [12, ...u64le(amount), decimals];
  }

  /**
   * Accounts in the order the token program reads them: source, mint,
   * destination, owner; the program key sits at index 4. Decoded by hand
   * from `TransactionVerifier.splTokenProgramId` / `VAULT_USDC_MINT`,
   * mirroring the Swift test's inline base58 decode (this module has no
   * base58 *decoder* — only the encoder the production code needs).
   */
  const tokenProgramKey = decodeBase58ToKey32(SPL_TOKEN_PROGRAM_ID);
  const usdcMintKey = decodeBase58ToKey32(VAULT_USDC_MINT);

  function transferTx(opts?: {
    amount?: bigint;
    accounts?: number[];
    mintKey?: Uint8Array;
    data?: number[];
  }): string {
    return makeTransaction({
      accountKeys: [key(1), opts?.mintKey ?? usdcMintKey, key(3), key(4), tokenProgramKey],
      programIndex: 4,
      instructionAccounts: opts?.accounts ?? [0, 1, 2, 3],
      data: opts?.data ?? transferData(opts?.amount ?? 7_660_000n),
    });
  }

  it('round-trips the SPL token program id', () => {
    expect(base58(tokenProgramKey)).toBe(SPL_TOKEN_PROGRAM_ID);
  });

  it('round-trips the vault USDC mint', () => {
    expect(base58(usdcMintKey)).toBe(VAULT_USDC_MINT);
  });

  it('accepts a token transfer matching the request', () => {
    expect(() =>
      verifyTokenTransfer({
        base64: transferTx(),
        expectedAmountMicro: 7_660_000n,
        expectedSource: base58(key(1)),
        expectedDestination: base58(key(3)),
        expectedOwner: base58(key(4)),
      }),
    ).not.toThrow();
  });

  it('accepts a token transfer when the source is unknown', () => {
    expect(() =>
      verifyTokenTransfer({
        base64: transferTx(),
        expectedAmountMicro: 7_660_000n,
        expectedSource: null,
        expectedDestination: base58(key(3)),
        expectedOwner: base58(key(4)),
      }),
    ).not.toThrow();
  });

  it('rejects a token transfer with a tampered amount', () => {
    try {
      verifyTokenTransfer({
        base64: transferTx({ amount: 999_999_999n }),
        expectedAmountMicro: 7_660_000n,
        expectedSource: null,
        expectedDestination: base58(key(3)),
        expectedOwner: base58(key(4)),
      });
      throw new Error('expected verifyTokenTransfer to throw');
    } catch (err) {
      expect((err as SolanaDecodeError).kind).toBe('argumentMismatch');
      expect((err as SolanaDecodeError).field).toBe('amount');
    }
  });

  it('rejects a token transfer through a substituted mint', () => {
    // Right program, right amount/decimals/destination/owner — but the mint
    // account is some other token, not VAULT_USDC_MINT. Not in the Swift
    // suite: TransactionVerifier.swift never checked this account at all.
    try {
      verifyTokenTransfer({
        base64: transferTx({ mintKey: key(7) }),
        expectedAmountMicro: 7_660_000n,
        expectedSource: base58(key(1)),
        expectedDestination: base58(key(3)),
        expectedOwner: base58(key(4)),
      });
      throw new Error('expected verifyTokenTransfer to throw');
    } catch (err) {
      expect((err as SolanaDecodeError).kind).toBe('argumentMismatch');
      expect((err as SolanaDecodeError).field).toBe('mint');
    }
  });

  it('rejects a token transfer to somewhere else', () => {
    try {
      verifyTokenTransfer({
        base64: transferTx(),
        expectedAmountMicro: 7_660_000n,
        expectedSource: null,
        expectedDestination: base58(key(9)),
        expectedOwner: base58(key(4)),
      });
      throw new Error('expected verifyTokenTransfer to throw');
    } catch (err) {
      expect((err as SolanaDecodeError).field).toBe('destination');
    }
  });

  // Destination and owner swapped: the same accounts, the money the other way.
  it('rejects a token transfer with accounts in the wrong seats', () => {
    try {
      verifyTokenTransfer({
        base64: transferTx({ accounts: [2, 1, 0, 3] }),
        expectedAmountMicro: 7_660_000n,
        expectedSource: null,
        expectedDestination: base58(key(3)),
        expectedOwner: base58(key(4)),
      });
      throw new Error('expected verifyTokenTransfer to throw');
    } catch (err) {
      expect((err as SolanaDecodeError).field).toBe('destination');
    }
  });

  it('rejects a token transfer authorised by someone else', () => {
    try {
      verifyTokenTransfer({
        base64: transferTx(),
        expectedAmountMicro: 7_660_000n,
        expectedSource: null,
        expectedDestination: base58(key(3)),
        expectedOwner: base58(key(9)),
      });
      throw new Error('expected verifyTokenTransfer to throw');
    } catch (err) {
      expect((err as SolanaDecodeError).field).toBe('owner');
    }
  });

  it('rejects a vault instruction offered as a token transfer', () => {
    try {
      verifyTokenTransfer({
        base64: transferTx({ data: [...discriminator, ...u64le(7_660_000n)] }),
        expectedAmountMicro: 7_660_000n,
        expectedSource: null,
        expectedDestination: base58(key(3)),
        expectedOwner: base58(key(4)),
      });
      throw new Error('expected verifyTokenTransfer to throw');
    } catch (err) {
      expect((err as SolanaDecodeError).kind).toBe('discriminatorMismatch');
    }
  });

  it('rejects a token transfer from a different program', () => {
    const tx = makeTransaction({
      accountKeys: [key(1), key(2), key(3), key(4), key(9)],
      programIndex: 4,
      instructionAccounts: [0, 1, 2, 3],
      data: transferData(7_660_000n),
    });
    try {
      verifyTokenTransfer({
        base64: tx,
        expectedAmountMicro: 7_660_000n,
        expectedSource: null,
        expectedDestination: base58(key(3)),
        expectedOwner: base58(key(4)),
      });
      throw new Error('expected verifyTokenTransfer to throw');
    } catch (err) {
      expect((err as SolanaDecodeError).kind).toBe('unexpectedProgram');
    }
  });

  // --- Edge cases not in the Swift suite ---

  it('rejects a program index that is out of range of the account keys', () => {
    // Only 2 accounts declared, but the instruction claims program index 2.
    const tx = makeTransaction({
      accountKeys: [key(1), key(2)],
      programIndex: 2,
      instructionAccounts: [0],
      data: [...discriminator, ...u64le(1n)],
    });
    try {
      decodeTransaction(tx);
      throw new Error('expected decodeTransaction to throw');
    } catch (err) {
      expect((err as SolanaDecodeError).kind).toBe('accountIndexOutOfRange');
    }
  });

  it('rejects a referenced account index that is out of range of the account keys', () => {
    const tx = makeTransaction({
      accountKeys: [key(1), key(2), key(9)],
      programIndex: 2,
      instructionAccounts: [0, 5], // 5 is out of range
      data: [...discriminator, ...u64le(1n)],
    });
    try {
      decodeTransaction(tx);
      throw new Error('expected decodeTransaction to throw');
    } catch (err) {
      expect((err as SolanaDecodeError).kind).toBe('accountIndexOutOfRange');
    }
  });

  it('verify() with expectedAmountMicro: null skips the amount check entirely', () => {
    // Only the discriminator is present — not even enough bytes for an
    // amount. `cancel_spend`/`propose_spend` call sites rely on this.
    const tx = makeTransaction({
      accountKeys: [key(1), key(2), key(9)],
      programIndex: 2,
      instructionAccounts: [0, 1],
      data: [...discriminator],
    });
    expect(() =>
      verify({
        base64: tx,
        expectedProgramId: base58(key(9)),
        expectedDiscriminator: discriminator,
        expectedAmountMicro: null,
        expectedAccounts: [base58(key(1))],
      }),
    ).not.toThrow();
  });
});

function decodeBase58ToKey32(value: string): Uint8Array {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const out = new Uint8Array(32);
  const digits: number[] = [];
  for (const ch of value) {
    let carry = alphabet.indexOf(ch);
    for (let i = 0; i < digits.length; i += 1) {
      carry += (digits[i] as number) * 58;
      digits[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      digits.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const bytes = digits.slice().reverse();
  out.set(bytes, 32 - bytes.length);
  return out;
}

describe('decodeTransaction version prefix (C5)', () => {
  it('rejects a versioned (v0) message prefix', () => {
    const legacy = base64Decode(
      makeTransaction({
        accountKeys: [key(1), key(2)],
        programIndex: 1,
        instructionAccounts: [0],
        data: [1],
      }),
    );
    const v0 = Uint8Array.from(legacy);
    v0[1 + 64 * 2] = 0x80; // first message byte, after the 2 blank signatures
    expect(() => decodeTransaction(base64Encode(v0))).toThrow(
      expect.objectContaining({ kind: 'unsupportedVersion' }),
    );
  });
});
