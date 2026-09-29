/**
 * `verifyWithdrawal` fixtures follow `transactionVerifier.test.ts`'s pattern for building a
 * minimal legacy transaction by hand. `withdrawFromWallet` end-to-end tests automock the network
 * collaborators but use the REAL address derivation (`solana/pda.ts`) — the source/destination
 * ATAs must be derived locally, so a test that mocked the derivation would prove nothing.
 */
import { buildWithdrawal, submitWithdrawal } from '../api/walletWithdraw';
import { base64Encode } from '../solana/base64';
import { VAULT_USDC_MINT } from '../solana/constants';
import { deriveAssociatedTokenAddress } from '../solana/pda';
import { SolanaDecodeError } from '../solana/shortVec';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  decodeBase58,
  SPL_TOKEN_PROGRAM_ID,
} from '../solana/transactionVerifier';
import { ensureVaultWallet } from '../wallet/walletHandle';
import { verifyWithdrawal, withdrawFromWallet } from './withdrawFlow';

jest.mock('../wallet/walletHandle');
jest.mock('../api/queries');
jest.mock('../api/walletWithdraw');

const mockedEnsureVaultWallet = jest.mocked(ensureVaultWallet);
const mockedBuildWithdrawal = jest.mocked(buildWithdrawal);
const mockedSubmitWithdrawal = jest.mocked(submitWithdrawal);

const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const OWNER = 'G6szifgvaFEefHrxSdgzMkKbaGWmuA5VBEsu57QRDZCp';
const RECIPIENT = '4cjqjSc1ASXG7HN7RjgCdknicom2HjfRdgmZmrTzNhnX';
const FEE_PAYER = 'BKUBw58cLFJenv2hVGJVhgza6qeBqMizf4J2kJJasWG2';
const OTHER = '3HjtUb3djHwXU9uaSRvuZRJ3ecZNBGnZZoPwhtaSWC6N';

const OWNER_ATA = deriveAssociatedTokenAddress(OWNER, VAULT_USDC_MINT);
const RECIPIENT_ATA = deriveAssociatedTokenAddress(RECIPIENT, VAULT_USDC_MINT);
const OTHER_ATA = deriveAssociatedTokenAddress(OTHER, VAULT_USDC_MINT);

function u64le(value: bigint): number[] {
  const bytes: number[] = [];
  let v = value;
  for (let i = 0; i < 8; i += 1) {
    bytes.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return bytes;
}

interface Ix {
  program: string;
  accounts: string[];
  data: number[];
}

/** Legacy transaction over `ixs`; the key table is built by first appearance. */
function makeTx(ixs: Ix[]): string {
  const keys: string[] = [];
  const index = (k: string): number => {
    const found = keys.indexOf(k);
    if (found !== -1) return found;
    keys.push(k);
    return keys.length - 1;
  };
  const encoded = ixs.map((ix) => ({
    program: index(ix.program),
    accounts: ix.accounts.map(index),
    data: ix.data,
  }));
  const bytes: number[] = [1, ...new Array(64).fill(0), 1, 0, 1, keys.length];
  for (const k of keys) bytes.push(...decodeBase58(k));
  bytes.push(...new Array(32).fill(7), encoded.length);
  for (const ix of encoded) {
    bytes.push(ix.program, ix.accounts.length, ...ix.accounts, ix.data.length, ...ix.data);
  }
  return base64Encode(new Uint8Array(bytes));
}

function transferIx(over: Partial<{ amount: bigint; mint: string; dest: string }> = {}): Ix {
  return {
    program: SPL_TOKEN_PROGRAM_ID,
    accounts: [OWNER_ATA, over.mint ?? VAULT_USDC_MINT, over.dest ?? RECIPIENT_ATA, OWNER],
    data: [12, ...u64le(over.amount ?? 7_660_000n), 6],
  };
}

function createIx(
  over: Partial<{ data: number[]; accounts: string[]; program: string }> = {},
): Ix {
  return {
    program: over.program ?? ASSOCIATED_TOKEN_PROGRAM_ID,
    accounts: over.accounts ?? [
      FEE_PAYER,
      RECIPIENT_ATA,
      RECIPIENT,
      VAULT_USDC_MINT,
      SYSTEM_PROGRAM,
      SPL_TOKEN_PROGRAM_ID,
    ],
    data: over.data ?? [],
  };
}

const BASE = {
  expectedAmountMicro: 7_660_000n,
  expectedSource: OWNER_ATA,
  expectedDestination: RECIPIENT_ATA,
  expectedOwner: OWNER,
  recipientAddress: RECIPIENT,
};

describe('verifyWithdrawal', () => {
  it('accepts a single-instruction transfer matching the confirmed destination/amount/owner', () => {
    expect(() =>
      verifyWithdrawal({ ...BASE, base64: makeTx([transferIx()]), createsRecipientAccount: false }),
    ).not.toThrow();
  });

  it('rejects a tampered amount', () => {
    expect(() =>
      verifyWithdrawal({
        ...BASE,
        base64: makeTx([transferIx({ amount: 999_999n })]),
        createsRecipientAccount: false,
      }),
    ).toThrow(SolanaDecodeError);
  });

  it('rejects a mismatched destination (the derived ATA the user did not confirm)', () => {
    expect(() =>
      verifyWithdrawal({
        ...BASE,
        base64: makeTx([transferIx({ dest: OTHER_ATA })]),
        createsRecipientAccount: false,
      }),
    ).toThrow(SolanaDecodeError);
  });

  it('rejects a substituted mint', () => {
    try {
      verifyWithdrawal({
        ...BASE,
        base64: makeTx([transferIx({ mint: OTHER })]),
        createsRecipientAccount: false,
      });
      throw new Error('expected to throw');
    } catch (err) {
      expect((err as SolanaDecodeError).kind).toBe('argumentMismatch');
      expect((err as SolanaDecodeError).field).toBe('mint');
    }
  });

  it('rejects when createsRecipientAccount is claimed but only one instruction is present', () => {
    expect(() =>
      verifyWithdrawal({ ...BASE, base64: makeTx([transferIx()]), createsRecipientAccount: true }),
    ).toThrow(SolanaDecodeError);
  });

  it('rejects a v0 message even when the rest is well formed (C5)', () => {
    const legacy = makeTx([transferIx()]);
    const bytes = Array.from(Buffer.from(legacy, 'base64'));
    bytes[1 + 64] = 0x80; // versioned-message prefix where `numRequiredSignatures` would be
    expect(() =>
      verifyWithdrawal({
        ...BASE,
        base64: base64Encode(new Uint8Array(bytes)),
        createsRecipientAccount: false,
      }),
    ).toThrow(expect.objectContaining({ kind: 'unsupportedVersion' }));
  });

  describe('create-recipient-ATA instruction (C4)', () => {
    const verifyCreate = (create: Ix) =>
      verifyWithdrawal({
        ...BASE,
        base64: makeTx([create, transferIx()]),
        createsRecipientAccount: true,
      });

    it.each([[[]], [[0]], [[1]]])('accepts a create instruction with data %j', (data) => {
      expect(() => verifyCreate(createIx({ data }))).not.toThrow();
    });

    it('rejects a leading instruction that is not the ATA program', () => {
      expect(() => verifyCreate(createIx({ program: SPL_TOKEN_PROGRAM_ID }))).toThrow(
        expect.objectContaining({ kind: 'unexpectedProgram' }),
      );
    });

    it('rejects an unexpected data tag (e.g. RecoverNested [2])', () => {
      expect(() => verifyCreate(createIx({ data: [2] }))).toThrow(
        expect.objectContaining({ kind: 'discriminatorMismatch' }),
      );
    });

    it.each([
      ['ata', 1, OTHER_ATA],
      ['wallet', 2, OTHER],
      ['mint', 3, OTHER],
      ['system', 4, OTHER],
      ['token', 5, OTHER],
      ['payer is the signing key', 0, OWNER],
    ])('rejects a create instruction with a wrong %s account', (_label, position, value) => {
      const accounts = createIx().accounts.slice();
      accounts[position as number] = value as string;
      expect(() => verifyCreate(createIx({ accounts }))).toThrow(SolanaDecodeError);
    });

    it('rejects a create instruction with the wrong number of accounts', () => {
      expect(() => verifyCreate(createIx({ accounts: createIx().accounts.slice(0, 5) }))).toThrow(
        SolanaDecodeError,
      );
    });
  });
});

describe('withdrawFromWallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEnsureVaultWallet.mockResolvedValue(OWNER);
    mockedBuildWithdrawal.mockResolvedValue({
      base64Tx: makeTx([transferIx()]),
      createsRecipientAccount: false,
    });
    mockedSubmitWithdrawal.mockResolvedValue({ signature: 'SIG', status: 'CONFIRMED' });
  });

  it('propagates a verify() failure before ever calling sign', async () => {
    mockedBuildWithdrawal.mockResolvedValue({
      base64Tx: 'UNSIGNED', // not valid transaction bytes
      createsRecipientAccount: false,
    });
    const sign = jest.fn();
    await expect(withdrawFromWallet(RECIPIENT, 7_660_000n, { sign })).rejects.toBeInstanceOf(
      Error,
    );
    expect(sign).not.toHaveBeenCalled();
    expect(mockedSubmitWithdrawal).not.toHaveBeenCalled();
  });

  it('signs and submits once verification passes, deriving source and destination locally', async () => {
    const sign = jest.fn(async () => 'SIGNED');

    const result = await withdrawFromWallet(RECIPIENT, 7_660_000n, { sign });

    expect(sign).toHaveBeenCalledWith(makeTx([transferIx()]));
    expect(mockedSubmitWithdrawal).toHaveBeenCalledWith({ signedTx: 'SIGNED' }, expect.anything());
    expect(result).toEqual({ signature: 'SIG', status: 'CONFIRMED' });
  });

  it('rejects a transfer whose source is not the local key’s own USDC account', async () => {
    const stolen: Ix = { ...transferIx(), accounts: [OTHER_ATA, VAULT_USDC_MINT, RECIPIENT_ATA, OWNER] };
    mockedBuildWithdrawal.mockResolvedValue({
      base64Tx: makeTx([stolen]),
      createsRecipientAccount: false,
    });
    const sign = jest.fn();

    await expect(withdrawFromWallet(RECIPIENT, 7_660_000n, { sign })).rejects.toThrow();
    expect(sign).not.toHaveBeenCalled();
  });

  it('rejects a create-ATA instruction that makes an account for someone else', async () => {
    mockedBuildWithdrawal.mockResolvedValue({
      base64Tx: makeTx([
        createIx({
          accounts: [FEE_PAYER, RECIPIENT_ATA, OTHER, VAULT_USDC_MINT, SYSTEM_PROGRAM, SPL_TOKEN_PROGRAM_ID],
        }),
        transferIx(),
      ]),
      createsRecipientAccount: true,
    });
    const sign = jest.fn();

    await expect(withdrawFromWallet(RECIPIENT, 7_660_000n, { sign })).rejects.toThrow();
    expect(sign).not.toHaveBeenCalled();
  });
});
