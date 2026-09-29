import { VAULT_PROGRAM_ID, VAULT_USDC_MINT } from './constants';
import { deriveAssociatedTokenAddress, deriveVaultPda } from './pda';
import { decodeBase58, encodeBase58 } from './transactionVerifier';

/**
 * Golden vectors computed with the real `@solana/web3.js` (`PublicKey.findProgramAddressSync`)
 * via plain Node — see `pda.ts`'s docblock for why Jest can't load that package directly. Any
 * drift here means `pda.ts`'s reimplementation has diverged from the audited library.
 */
const VECTORS = [
  { tripId: 1, vaultPda: '2pDfh37E1mvww6ZW8KWYRFXqL4k4JcJDfwW6k4wK6GXt' },
  { tripId: 42, vaultPda: 'CFkgJjCcwSHD8PLchMWcwVtFrtevXgpCeY2xBiNmwcM7' },
  { tripId: 999999, vaultPda: 'Q9B5mh8KR8M8phgis8ibxDAFZPxNN4dbY3LftD6jcPv' },
];

describe('deriveVaultPda', () => {
  it.each(VECTORS)('matches @solana/web3.js for trip $tripId', ({ tripId, vaultPda }) => {
    expect(deriveVaultPda(tripId, VAULT_PROGRAM_ID)).toBe(vaultPda);
  });

  it('is deterministic and program-scoped (different program id -> different PDA)', () => {
    const other = deriveVaultPda(1, VAULT_USDC_MINT); // any other valid base58 pubkey
    expect(other).not.toBe(deriveVaultPda(1, VAULT_PROGRAM_ID));
  });
});

/** Computed with the real `@solana/web3.js` `PublicKey.findProgramAddressSync` via plain Node. */
const ATA_VECTORS = [
  { owner: VAULT_PROGRAM_ID, ata: 'GaFfEdHj7vHCw4QnTqTdoZQTviNGtSe9h96fuc4DoTYi' },
  { owner: '11111111111111111111111111111111', ata: '27SXXCACcdgCZLU5hwYYjCb4j22H4ovDpHooVJpAJtXw' },
  { owner: VAULT_USDC_MINT, ata: '5JJHixCXVUApUBMhh5KRJsWL3qmmNATq4vCDWwGEvDzQ' },
  // A vault PDA (off-curve owner).
  { owner: '2pDfh37E1mvww6ZW8KWYRFXqL4k4JcJDfwW6k4wK6GXt', ata: 'C3HTBDktdNz2St856CRDbmXjd8UfGW2K5LvBrTtZxA4A' },
];

describe('deriveAssociatedTokenAddress', () => {
  it.each(ATA_VECTORS)('matches @solana/web3.js for owner $owner', ({ owner, ata }) => {
    expect(deriveAssociatedTokenAddress(owner, VAULT_USDC_MINT)).toBe(ata);
  });
});

describe('base58 golden vectors (leading zeros, system program)', () => {
  const VECTORS = [
    { hex: '00'.repeat(32), base58: '11111111111111111111111111111111' }, // system program
    { hex: '00'.repeat(31) + '01', base58: '11111111111111111111111111111112' },
    { hex: '00ff' + '00'.repeat(28) + '0007', base58: '14tXMMgexG14Bgjk9YeN37BfMcgSW1Wg1f7391cpkgTY' },
    { hex: '000001' + '00'.repeat(28) + 'ff', base58: '11Cd4BX7vopdUjCBe56dfR9Mw86iDpdcAZbJ2yE8op' },
  ];

  it.each(VECTORS)('encodes $base58', ({ hex, base58 }) => {
    expect(encodeBase58(Uint8Array.from(Buffer.from(hex, 'hex')))).toBe(base58);
  });

  it.each(VECTORS)('decodes $base58', ({ hex, base58 }) => {
    expect(Buffer.from(decodeBase58(base58)).toString('hex')).toBe(hex);
  });

  it('round-trips a key with a leading zero byte', () => {
    const key = new Uint8Array(32).fill(9);
    key[0] = 0;
    expect(Array.from(decodeBase58(encodeBase58(key)))).toEqual(Array.from(key));
  });

  it('rejects an address that decodes past 32 bytes', () => {
    expect(() => decodeBase58('z'.repeat(50))).toThrow();
  });
});
