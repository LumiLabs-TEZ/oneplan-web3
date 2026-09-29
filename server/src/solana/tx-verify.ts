import { BadRequestException } from '@nestjs/common';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';

import idl from './idl/oneplan_vault.json';

/**
 * Server-side decoding of the transactions members sign on their device.
 *
 * The server is the fee payer, so it partial-signs and broadcasts whatever a
 * client hands back. Nothing in the request body can be trusted to describe
 * that transaction: the amount, the vault, the signer and the instruction all
 * have to be read out of the signed bytes themselves (audit S1-S3). Every
 * builder in this codebase emits a single-instruction legacy transaction, so
 * "exactly one instruction" is part of the contract, not a limitation.
 */

type IdlAccountNode = { name: string; accounts?: IdlAccountNode[] };
type IdlInstruction = {
  name: string;
  discriminator: number[];
  accounts: IdlAccountNode[];
  args: { name: string; type: unknown }[];
};

const INSTRUCTIONS = (idl as { instructions: IdlInstruction[] }).instructions;

/** `transferChecked` is instruction 12 of the SPL token program. */
const SPL_TRANSFER_CHECKED = 12;

export interface VaultInstruction {
  /** Snake-case IDL name, e.g. `propose_spend`. */
  name: string;
  /** u64 argument, for the instructions that carry exactly one. */
  amountMicro: bigint | null;
  accounts: Record<string, PublicKey>;
  signers: PublicKey[];
}

export interface TokenTransfer {
  source: PublicKey;
  mint: PublicKey;
  destination: PublicKey;
  authority: PublicKey;
  amountMicro: bigint;
  decimals: number;
}

function flattenAccountNames(nodes: IdlAccountNode[]): string[] {
  return nodes.flatMap((node) =>
    node.accounts ? flattenAccountNames(node.accounts) : [node.name],
  );
}

function malformed(reason: string): BadRequestException {
  return new BadRequestException(`Signed transaction rejected: ${reason}`);
}

/** Parses, requires the server as fee payer and a single instruction, and checks every signature. */
function parseSingleInstruction(
  base64Tx: string,
  feePayer: PublicKey,
): { tx: Transaction; ix: TransactionInstruction } {
  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(base64Tx, 'base64'));
  } catch {
    throw malformed('not a legacy transaction');
  }
  if (!tx.feePayer || !tx.feePayer.equals(feePayer)) {
    throw malformed('fee payer is not this server');
  }
  if (tx.instructions.length !== 1) {
    throw malformed('expected exactly one instruction');
  }
  // Every required signature present and valid: the member really signed this
  // exact message, and it is not a template with the signature slot blank.
  if (!tx.verifySignatures()) {
    throw malformed('signatures are missing or invalid');
  }
  return { tx, ix: tx.instructions[0] };
}

/** The transaction's first signature, base58 — the id the chain knows it by. */
export function transactionSignature(base64Tx: string): string {
  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(base64Tx, 'base64'));
  } catch {
    throw malformed('not a legacy transaction');
  }
  if (!tx.signature) {
    throw malformed('transaction is not signed');
  }
  return bs58.encode(tx.signature);
}

/**
 * Decodes a single-instruction vault-program transaction and checks it is the
 * instruction the caller expects. Callers still have to compare accounts and
 * the amount against what THEY expect (this only proves what the bytes say).
 */
export function decodeVaultInstruction(
  base64Tx: string,
  feePayer: PublicKey,
  programId: PublicKey,
  expectedName: string,
): VaultInstruction {
  const { ix } = parseSingleInstruction(base64Tx, feePayer);
  if (!ix.programId.equals(programId)) {
    throw malformed('instruction targets a different program');
  }
  const def = INSTRUCTIONS.find((item) => item.name === expectedName);
  if (!def) {
    throw new Error(`unknown vault instruction ${expectedName}`);
  }
  const discriminator = Buffer.from(def.discriminator);
  if (ix.data.length < 8 || !ix.data.subarray(0, 8).equals(discriminator)) {
    throw malformed(`instruction is not ${expectedName}`);
  }

  const takesAmount =
    def.args.length === 1 &&
    def.args[0].name === 'amount' &&
    def.args[0].type === 'u64';
  if (takesAmount ? ix.data.length !== 16 : ix.data.length !== 8) {
    throw malformed(`unexpected ${expectedName} data length`);
  }

  const names = flattenAccountNames(def.accounts);
  if (ix.keys.length !== names.length) {
    throw malformed(`unexpected ${expectedName} account count`);
  }
  const accounts: Record<string, PublicKey> = {};
  const signers: PublicKey[] = [];
  names.forEach((name, index) => {
    accounts[name] = ix.keys[index].pubkey;
    if (ix.keys[index].isSigner) {
      signers.push(ix.keys[index].pubkey);
    }
  });

  return {
    name: expectedName,
    amountMicro: takesAmount ? ix.data.readBigUInt64LE(8) : null,
    accounts,
    signers,
  };
}

/** Decodes a single SPL `transferChecked` (a personal payment). */
export function decodeTransferChecked(
  base64Tx: string,
  feePayer: PublicKey,
): TokenTransfer {
  const { ix } = parseSingleInstruction(base64Tx, feePayer);
  if (!ix.programId.equals(TOKEN_PROGRAM_ID)) {
    throw malformed('instruction is not an SPL token instruction');
  }
  if (ix.data.length !== 10 || ix.data[0] !== SPL_TRANSFER_CHECKED) {
    throw malformed('instruction is not transferChecked');
  }
  if (ix.keys.length !== 4 || !ix.keys[3].isSigner) {
    throw malformed('unexpected transferChecked accounts');
  }
  return {
    source: ix.keys[0].pubkey,
    mint: ix.keys[1].pubkey,
    destination: ix.keys[2].pubkey,
    authority: ix.keys[3].pubkey,
    amountMicro: ix.data.readBigUInt64LE(1),
    decimals: ix.data[9],
  };
}

/**
 * Requires each named account of a decoded instruction to be exactly the key
 * the server derived for this trip / member / payment. Throws 400 naming the
 * first mismatch.
 */
export function assertInstructionAccounts(
  ix: VaultInstruction,
  expected: [name: string, key: PublicKey][],
  what: string,
): void {
  for (const [name, key] of expected) {
    if (!ix.accounts[name].equals(key)) {
      throw new BadRequestException(
        `${what} rejected: ${name} is not the expected account`,
      );
    }
  }
}
