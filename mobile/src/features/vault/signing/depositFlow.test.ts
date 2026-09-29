/**
 * Covers the security-audit hardening (S-4b, review C1): `depositToVault` must bind `verify()`'s
 * `vaultPda`/`vaultUsdcAta`/`owner`/`ownerAta` expectations to what it derives client-side (the
 * immutable on-chain seeds + the local Privy key), not to whatever the server's balance/wallet
 * responses echo back. A malicious or buggy server handing back a transaction built against a
 * different vault, owner or owner account must be rejected before anything is signed or submitted.
 * The address derivation is NOT mocked — these are the real noble-based `solana/pda.ts` outputs.
 */
import { base64Encode } from '../solana/base64';
import { VAULT_DISCRIMINATORS, VAULT_PROGRAM_ID, VAULT_USDC_MINT } from '../solana/constants';
import { deriveAssociatedTokenAddress, deriveVaultPda } from '../solana/pda';
import { decodeBase58 } from '../solana/transactionVerifier';

jest.mock('../api/mutations', () => ({
  linkVaultWallet: jest.fn(),
  createVault: jest.fn(),
  buildVaultDeposit: jest.fn(),
  submitVaultDeposit: jest.fn(),
}));
jest.mock('../api/queries', () => ({
  fetchVaultBalance: jest.fn(),
  fetchMyVaultWallet: jest.fn(),
}));
jest.mock('../wallet/walletHandle', () => ({
  ensureVaultWallet: jest.fn(),
}));
// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import {
  buildVaultDeposit,
  createVault,
  linkVaultWallet,
  submitVaultDeposit,
} from '../api/mutations';
// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import { fetchMyVaultWallet, fetchVaultBalance } from '../api/queries';
// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import { ensureVaultWallet } from '../wallet/walletHandle';
// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import { depositToVault } from './depositFlow';

const mockBuildVaultDeposit = buildVaultDeposit as jest.Mock;
const mockSubmitVaultDeposit = submitVaultDeposit as jest.Mock;
const mockLinkVaultWallet = linkVaultWallet as jest.Mock;
const mockCreateVault = createVault as jest.Mock;
const mockFetchVaultBalance = fetchVaultBalance as jest.Mock;
const mockFetchMyVaultWallet = fetchMyVaultWallet as jest.Mock;
const mockEnsureVaultWallet = ensureVaultWallet as jest.Mock;

const TRIP_ID = 7;
const AMOUNT_MICRO = 5_000_000n;

// The vault PDA/ATA addresses are golden vectors computed with the real `@solana/web3.js`
// (`PublicKey.findProgramAddressSync`) via plain Node — the first test below also proves the
// derivation this flow runs reproduces them.
const OWNER = 'G6szifgvaFEefHrxSdgzMkKbaGWmuA5VBEsu57QRDZCp'; // any distinct valid base58 pubkey
const OWNER_ATA = deriveAssociatedTokenAddress(OWNER, VAULT_USDC_MINT);
const OTHER_OWNER = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const TREASURY_ATA = 'BKUBw58cLFJenv2hVGJVhgza6qeBqMizf4J2kJJasWG2';
const CORRECT_VAULT_PDA = '5fhkm77U6cttj9ogBPpUi84qjcvPtrGZg72LFD96tSCY'; // vault PDA for TRIP_ID
const CORRECT_VAULT_ATA = 'ATNrK31kpDb743HxB7RZYwiAQMtxySySujhkortkTFKP';
/** The vault PDA/ATA for a *different* trip — stands in for a server bug/compromise pointing at the wrong vault. */
const WRONG_VAULT_PDA = '9s9epnMpWgczkWgqLcdqCqr9opuyDDSx5J9emqYNv93D'; // vault PDA for TRIP_ID + 1
const WRONG_VAULT_ATA = '4ivVywe6yEaLwpHZUKCLrZzwam4YJRShhcizWSgaXdVA';

function u64leBytes(value: bigint): number[] {
  const out: number[] = [];
  let v = value;
  for (let i = 0; i < 8; i += 1) {
    out.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return out;
}

/** Minimal legacy deposit transaction: program + 5 accounts + discriminator/amount data. */
function makeDepositTx(accounts: {
  vaultPda: string;
  vaultUsdcAta: string;
  treasuryAta: string;
  owner: string;
  ownerAta: string;
}): string {
  const accountKeys = [
    decodeBase58(VAULT_PROGRAM_ID),
    decodeBase58(accounts.vaultPda),
    decodeBase58(accounts.vaultUsdcAta),
    decodeBase58(accounts.treasuryAta),
    decodeBase58(accounts.owner),
    decodeBase58(accounts.ownerAta),
  ];
  const data = [...VAULT_DISCRIMINATORS.deposit, ...u64leBytes(AMOUNT_MICRO)];

  const bytes: number[] = [];
  bytes.push(1); // signer count (compact-u16, fits in one byte)
  bytes.push(...new Array(64).fill(0)); // one blank signature
  bytes.push(1, 0, 1); // message header
  bytes.push(accountKeys.length);
  for (const key of accountKeys) bytes.push(...key);
  bytes.push(...new Array(32).fill(7)); // blockhash
  bytes.push(1); // one instruction
  bytes.push(0); // programIndex -> accountKeys[0]
  bytes.push(5); // five instruction accounts
  bytes.push(1, 2, 3, 4, 5); // -> vaultPda, vaultUsdcAta, treasuryAta, owner, ownerAta
  bytes.push(data.length);
  bytes.push(...data);
  return base64Encode(new Uint8Array(bytes));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureVaultWallet.mockResolvedValue(OWNER);
  mockLinkVaultWallet.mockResolvedValue(undefined);
  mockCreateVault.mockResolvedValue(undefined);
  mockFetchVaultBalance.mockResolvedValue({
    vaultPda: CORRECT_VAULT_PDA, // intentionally correct here — the flow must not need this anyway
    usdcAta: CORRECT_VAULT_ATA,
    treasuryAta: TREASURY_ATA,
    balanceMicro: '0',
    thresholdMicro: '3000000',
    dailyLimitMicro: '100000000',
  });
  // A hostile wallet response: the flow must ignore it entirely.
  mockFetchMyVaultWallet.mockResolvedValue({
    publicKey: OTHER_OWNER,
    usdcAta: WRONG_VAULT_ATA,
    balanceMicro: '0',
  });
});

describe('depositToVault account verification (security audit S-4b)', () => {
  it('derives the vault PDA/ATA exactly as @solana/web3.js does (golden vectors)', () => {
    expect(deriveVaultPda(TRIP_ID, VAULT_PROGRAM_ID)).toBe(CORRECT_VAULT_PDA);
    expect(deriveAssociatedTokenAddress(CORRECT_VAULT_PDA, VAULT_USDC_MINT)).toBe(CORRECT_VAULT_ATA);
  });

  it('signs and submits when the built transaction targets the client-derived vault PDA/ATA', async () => {
    mockBuildVaultDeposit.mockResolvedValue({
      base64Tx: makeDepositTx({
        vaultPda: CORRECT_VAULT_PDA,
        vaultUsdcAta: CORRECT_VAULT_ATA,
        treasuryAta: TREASURY_ATA,
        owner: OWNER,
        ownerAta: OWNER_ATA,
      }),
    });
    const sign = jest.fn().mockResolvedValue('signed-tx');
    mockSubmitVaultDeposit.mockResolvedValue({ status: 'completed', signature: 'sig' });

    const result = await depositToVault(TRIP_ID, AMOUNT_MICRO, { sign });

    expect(sign).toHaveBeenCalled();
    expect(mockSubmitVaultDeposit).toHaveBeenCalled();
    expect(result).toEqual({ status: 'completed', signature: 'sig' });
  });

  it('rejects before signing when the server-built transaction targets a different vault PDA/ATA', async () => {
    mockBuildVaultDeposit.mockResolvedValue({
      base64Tx: makeDepositTx({
        vaultPda: WRONG_VAULT_PDA,
        vaultUsdcAta: WRONG_VAULT_ATA,
        treasuryAta: TREASURY_ATA,
        owner: OWNER,
        ownerAta: OWNER_ATA,
      }),
    });
    const sign = jest.fn().mockResolvedValue('signed-tx');

    await expect(depositToVault(TRIP_ID, AMOUNT_MICRO, { sign })).rejects.toThrow();

    expect(sign).not.toHaveBeenCalled();
    expect(mockSubmitVaultDeposit).not.toHaveBeenCalled();
  });

  it('rejects when only the vault ATA is swapped (PDA correct, ATA wrong)', async () => {
    mockBuildVaultDeposit.mockResolvedValue({
      base64Tx: makeDepositTx({
        vaultPda: CORRECT_VAULT_PDA,
        vaultUsdcAta: WRONG_VAULT_ATA,
        treasuryAta: TREASURY_ATA,
        owner: OWNER,
        ownerAta: OWNER_ATA,
      }),
    });
    const sign = jest.fn().mockResolvedValue('signed-tx');

    await expect(depositToVault(TRIP_ID, AMOUNT_MICRO, { sign })).rejects.toThrow();

    expect(sign).not.toHaveBeenCalled();
    expect(mockSubmitVaultDeposit).not.toHaveBeenCalled();
  });

  it('rejects a transaction whose owner is not the local Privy key (server-reported wallet ignored)', async () => {
    mockBuildVaultDeposit.mockResolvedValue({
      base64Tx: makeDepositTx({
        vaultPda: CORRECT_VAULT_PDA,
        vaultUsdcAta: CORRECT_VAULT_ATA,
        treasuryAta: TREASURY_ATA,
        owner: OTHER_OWNER,
        ownerAta: deriveAssociatedTokenAddress(OTHER_OWNER, VAULT_USDC_MINT),
      }),
    });
    const sign = jest.fn().mockResolvedValue('signed-tx');

    await expect(depositToVault(TRIP_ID, AMOUNT_MICRO, { sign })).rejects.toThrow();

    expect(sign).not.toHaveBeenCalled();
    expect(mockSubmitVaultDeposit).not.toHaveBeenCalled();
  });

  it('rejects a transaction that debits a USDC account other than the one derived from the local key', async () => {
    mockBuildVaultDeposit.mockResolvedValue({
      base64Tx: makeDepositTx({
        vaultPda: CORRECT_VAULT_PDA,
        vaultUsdcAta: CORRECT_VAULT_ATA,
        treasuryAta: TREASURY_ATA,
        owner: OWNER,
        ownerAta: WRONG_VAULT_ATA,
      }),
    });
    const sign = jest.fn().mockResolvedValue('signed-tx');

    await expect(depositToVault(TRIP_ID, AMOUNT_MICRO, { sign })).rejects.toThrow();

    expect(sign).not.toHaveBeenCalled();
    expect(mockSubmitVaultDeposit).not.toHaveBeenCalled();
  });
});
