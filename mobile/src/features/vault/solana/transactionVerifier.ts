/**
 * Port of `ios/OnePlan/OnePlan/Services/Solana/TransactionVerifier.swift`
 * (branch `feat/web3-version`).
 *
 * Decodes a legacy Solana transaction far enough to check it against the
 * request the app itself made, then refuses to sign on any mismatch.
 *
 * The server builds every transaction, so without this a compromised server
 * could hand back one that drains the vault while the screen still reads
 * "200,000d to Nguyen Van A".
 *
 * This is a machine check. Nothing here is shown to the user, who continues
 * to see only the human summary.
 *
 * Legacy format only. The server is constrained to legacy transactions
 * precisely so this stays short: versioned transactions add address lookup
 * tables, and resolving those would mean fetching accounts before it is safe
 * to sign.
 */
import { base64Decode } from './base64';
import { VAULT_USDC_MINT } from './constants';
import { decodeShortVec, SolanaDecodeError } from './shortVec';

/** Base58 with the Bitcoin alphabet, which Solana uses for addresses. */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encodeBase58(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += (digits[i] as number) << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let leadingZeros = 0;
  for (const byte of bytes) {
    if (byte !== 0) break;
    leadingZeros += 1;
  }

  const body = digits
    .slice()
    .reverse()
    .map((d) => BASE58_ALPHABET[d])
    .join('');
  return '1'.repeat(leadingZeros) + body;
}

/** Decodes a base58 Solana address into its 32 raw bytes. */
export function decodeBase58(value: string): Uint8Array {
  const digits: number[] = [];
  for (const char of value) {
    const charValue = BASE58_ALPHABET.indexOf(char);
    if (charValue === -1) throw new Error(`Invalid base58 character: ${char}`);
    let carry = charValue;
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

  let leadingZeros = 0;
  for (const char of value) {
    if (char !== '1') break;
    leadingZeros += 1;
  }

  // Leading '1's are the zero prefix, which `out` already provides; the significant bytes
  // are right-aligned after it.
  const bytes = digits.slice().reverse();
  if (bytes.length + leadingZeros > 32) throw new Error('Invalid base58 address length');
  const out = new Uint8Array(32);
  out.set(bytes, 32 - bytes.length);
  return out;
}

export interface DecodedInstruction {
  programId: string;
  accountKeys: string[];
  data: Uint8Array;
}

export interface DecodedTransaction {
  accountKeys: string[];
  instructions: DecodedInstruction[];
}

function byteAt(bytes: Uint8Array, index: number): number {
  const value = bytes[index];
  if (value === undefined) throw SolanaDecodeError.truncated();
  return value;
}

export function decodeTransaction(base64: string): DecodedTransaction {
  let bytes: Uint8Array;
  try {
    bytes = base64Decode(base64);
  } catch {
    throw SolanaDecodeError.truncated();
  }

  const signatures = decodeShortVec(bytes, 0);
  let offset = signatures.offset + signatures.value * 64;
  if (offset + 3 > bytes.length) throw SolanaDecodeError.truncated();
  // A versioned message starts with a prefix byte whose high bit is set (0x80 = v0); a legacy
  // message starts with `numRequiredSignatures`, which is always < 128. Refuse anything
  // versioned outright — this decoder only understands the legacy layout, and parsing a v0
  // message as legacy would let the runtime and this check disagree about the account list.
  if (((bytes[offset] as number) & 0x80) !== 0) throw SolanaDecodeError.unsupportedVersion();
  offset += 3; // header: required signatures, readonly signed, readonly unsigned

  const accounts = decodeShortVec(bytes, offset);
  offset = accounts.offset;
  const accountKeys: string[] = [];
  for (let i = 0; i < accounts.value; i += 1) {
    if (offset + 32 > bytes.length) throw SolanaDecodeError.truncated();
    accountKeys.push(encodeBase58(bytes.slice(offset, offset + 32)));
    offset += 32;
  }

  if (offset + 32 > bytes.length) throw SolanaDecodeError.truncated();
  offset += 32; // recent blockhash

  const instructionCount = decodeShortVec(bytes, offset);
  offset = instructionCount.offset;
  const instructions: DecodedInstruction[] = [];

  for (let i = 0; i < instructionCount.value; i += 1) {
    if (offset >= bytes.length) throw SolanaDecodeError.truncated();
    const programIndex = byteAt(bytes, offset);
    offset += 1;
    if (programIndex >= accountKeys.length) throw SolanaDecodeError.accountIndexOutOfRange();

    const accountIndexCount = decodeShortVec(bytes, offset);
    offset = accountIndexCount.offset;
    if (offset + accountIndexCount.value > bytes.length) throw SolanaDecodeError.truncated();
    const referenced: string[] = [];
    for (let j = 0; j < accountIndexCount.value; j += 1) {
      const index = byteAt(bytes, offset + j);
      if (index >= accountKeys.length) throw SolanaDecodeError.accountIndexOutOfRange();
      referenced.push(accountKeys[index] as string);
    }
    offset += accountIndexCount.value;

    const dataLength = decodeShortVec(bytes, offset);
    offset = dataLength.offset;
    if (offset + dataLength.value > bytes.length) throw SolanaDecodeError.truncated();
    const data = bytes.slice(offset, offset + dataLength.value);
    offset += dataLength.value;

    instructions.push({
      programId: accountKeys[programIndex] as string,
      accountKeys: referenced,
      data,
    });
  }

  return { accountKeys, instructions };
}

function bytesEqual(a: Uint8Array, b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Reads a little-endian u64 as a bigint (Solana amounts can exceed 2^53). */
function readU64LE(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i -= 1) {
    value = (value << 8n) | BigInt(bytes[i] as number);
  }
  return value;
}

export interface VerifyParams {
  base64: string;
  expectedProgramId: string;
  expectedDiscriminator: readonly number[];
  expectedAmountMicro: bigint | null;
  expectedAccounts: readonly string[];
}

/**
 * Throws unless the transaction contains exactly the one instruction the app
 * asked for, against the expected program, amount and accounts.
 */
export function verify(params: VerifyParams): void {
  const decoded = decodeTransaction(params.base64);

  if (decoded.instructions.length !== 1) throw SolanaDecodeError.instructionCountMismatch();
  const instruction = decoded.instructions[0] as DecodedInstruction;

  if (instruction.programId !== params.expectedProgramId) {
    throw SolanaDecodeError.unexpectedProgram();
  }
  if (
    instruction.data.length < 8 ||
    !bytesEqual(instruction.data.slice(0, 8), params.expectedDiscriminator)
  ) {
    throw SolanaDecodeError.discriminatorMismatch();
  }

  if (params.expectedAmountMicro !== null) {
    if (instruction.data.length < 16) throw SolanaDecodeError.argumentMismatch('amount');
    const amount = readU64LE(instruction.data.slice(8, 16));
    if (amount !== params.expectedAmountMicro) throw SolanaDecodeError.argumentMismatch('amount');
  }

  for (const account of params.expectedAccounts) {
    if (!instruction.accountKeys.includes(account)) {
      throw SolanaDecodeError.argumentMismatch(`account ${account}`);
    }
  }
}

/** The SPL Token program, which owns every USDC transfer. */
export const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/**
 * The SPL Associated Token Account program — fixed across every Solana cluster (devnet, mainnet).
 * Used by `wallet-withdraw` (Wave C) to recognise the optional "create the recipient's USDC
 * account" instruction a withdrawal transaction carries when `createsRecipientAccount` is true.
 */
export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

/** `transferChecked` instruction tag. */
const TRANSFER_CHECKED_TAG = 12;
const USDC_DECIMALS = 6;

export interface VerifyTokenTransferParams {
  base64: string;
  expectedAmountMicro: bigint;
  expectedSource: string | null;
  expectedDestination: string;
  expectedOwner: string;
}

export interface VerifyTokenTransferInstructionParams {
  instruction: DecodedInstruction;
  expectedAmountMicro: bigint;
  expectedSource: string | null;
  expectedDestination: string;
  expectedOwner: string;
}

/**
 * The per-instruction half of `verifyTokenTransfer`, split out so a caller that already decoded
 * the transaction itself (e.g. `withdrawFlow.ts`, which allows one leading
 * "create associated token account" instruction ahead of the transfer) can check just the
 * transfer instruction without re-decoding or re-asserting instruction count.
 *
 * Positional rather than "contains": a token transfer's accounts are
 * `[source, mint, destination, owner]`, and a transaction that merely mentions the right accounts
 * in the wrong seats sends the money the other way. Also checks the mint (index 1) against
 * `VAULT_USDC_MINT` — an intentional divergence from the Swift original, which never checked it.
 * See README "Fixed vs Swift".
 */
export function verifyTokenTransferInstruction(params: VerifyTokenTransferInstructionParams): void {
  const { instruction } = params;

  if (instruction.programId !== SPL_TOKEN_PROGRAM_ID) throw SolanaDecodeError.unexpectedProgram();

  // tag, u64 amount, u8 decimals
  if (instruction.data.length !== 10 || instruction.data[0] !== TRANSFER_CHECKED_TAG) {
    throw SolanaDecodeError.discriminatorMismatch();
  }
  const amount = readU64LE(instruction.data.slice(1, 9));
  if (amount !== params.expectedAmountMicro) throw SolanaDecodeError.argumentMismatch('amount');
  if (instruction.data[9] !== USDC_DECIMALS) throw SolanaDecodeError.argumentMismatch('decimals');

  if (instruction.accountKeys.length !== 4) throw SolanaDecodeError.argumentMismatch('accounts');
  if (instruction.accountKeys[1] !== VAULT_USDC_MINT) {
    throw SolanaDecodeError.argumentMismatch('mint');
  }
  if (params.expectedSource !== null && instruction.accountKeys[0] !== params.expectedSource) {
    throw SolanaDecodeError.argumentMismatch('source');
  }
  if (instruction.accountKeys[2] !== params.expectedDestination) {
    throw SolanaDecodeError.argumentMismatch('destination');
  }
  if (instruction.accountKeys[3] !== params.expectedOwner) {
    throw SolanaDecodeError.argumentMismatch('owner');
  }
}

/**
 * Throws unless the transaction is exactly one SPL `transferChecked` of
 * `expectedAmountMicro` into `expectedDestination`, authorised by
 * `expectedOwner` (and, when known, out of `expectedSource`).
 */
export function verifyTokenTransfer(params: VerifyTokenTransferParams): void {
  const decoded = decodeTransaction(params.base64);

  if (decoded.instructions.length !== 1) throw SolanaDecodeError.instructionCountMismatch();
  verifyTokenTransferInstruction({
    instruction: decoded.instructions[0] as DecodedInstruction,
    expectedAmountMicro: params.expectedAmountMicro,
    expectedSource: params.expectedSource,
    expectedDestination: params.expectedDestination,
    expectedOwner: params.expectedOwner,
  });
}
