/**
 * Port of the pay/quote/approve/cancel behaviours in
 * `ios/OnePlan/OnePlanTests/TripVaultServiceTests.swift`-shaped coverage (there is no direct Swift
 * test file for this service on `feat/web3-version`; behaviour is pinned against
 * `TripVaultService.swift` itself — see file header of `./pay.ts`).
 *
 * `transactionVerifier` is mocked here: its own byte-level correctness is covered by
 * `../solana/transactionVerifier.test.ts`. `signAndSubmit` (`../signing/pipeline.ts`) is the real
 * implementation — it is covered by its own tests, and running it for real here pins that this
 * file actually calls it rather than signing/submitting by hand. Only the Privy wallet underneath
 * it (`../wallet/walletHandle.ts`) is faked, via the same `setWalletHandle` seam
 * `walletHandle.test.ts` uses. These tests pin which discriminator/accounts/amount each call site
 * asks `TransactionVerifier` to check — the security-critical branching this file exists for,
 * including the audit-flagged (S-4/S-4b) amount/source binding: `prepare`'s response must agree
 * with an independent `quote` call before anything is signed.
 */
import { QueryClient } from '@tanstack/react-query';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';

import { VAULT_DISCRIMINATORS, VAULT_PROGRAM_ID, VAULT_USDC_MINT } from '../solana/constants';
import { base64Encode } from '../solana/base64';
import { deriveAssociatedTokenAddress, deriveVaultPda } from '../solana/pda';
import * as transactionVerifier from '../solana/transactionVerifier';
import { _resetWalletHandleForTests, setWalletHandle } from '../wallet/walletHandle';
import {
  approveVaultTransaction,
  cancelVaultTransaction,
  invalidateVaultPay,
  lookupVaultRecipient,
  payVault,
  quoteVaultPayment,
  VaultPayError,
  VaultPaySecurityError,
  vaultPayErrorMessage,
  type PayRequest,
} from './pay';

// Only the byte-level checks are mocked; base58 (used by the real `../solana/pda` derivation)
// stays real, since the derived accounts are exactly what these tests pin.
jest.mock('../solana/transactionVerifier', () => ({
  ...jest.requireActual('../solana/transactionVerifier'),
  verify: jest.fn(),
  verifyTokenTransfer: jest.fn(),
}));

const verifyMock = transactionVerifier.verify as jest.Mock;
const verifyTokenTransferMock = transactionVerifier.verifyTokenTransfer as jest.Mock;

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// A valid pubkey standing in for the local Privy wallet.
const SIGNER = 'G6szifgvaFEefHrxSdgzMkKbaGWmuA5VBEsu57QRDZCp';
const TRIP_ID = 5;
// Derived on the client (S-4b, C1): what every verify() call must be pinned to.
const VAULT_PDA = deriveVaultPda(TRIP_ID, VAULT_PROGRAM_ID);
const VAULT_ATA = deriveAssociatedTokenAddress(VAULT_PDA, VAULT_USDC_MINT);
const SIGNER_ATA = deriveAssociatedTokenAddress(SIGNER, VAULT_USDC_MINT);

// Deliberately hostile: a compromised server echoes a foreign vault PDA / USDC ATA. None of
// these may reach a verify() call — only `spendRecipientAta` is (still) read from here.
const BALANCE = {
  vaultPda: 'ServerChosenVaultPda1111111111111111111111111',
  usdcAta: 'ServerChosenVaultAta1111111111111111111111111',
  treasuryAta: 'treasuryAta',
  spendRecipientAta: 'spendRecipientAta',
  balanceMicro: '10000000',
  thresholdMicro: '3000000',
  dailyLimitMicro: '100000000',
};

const QUOTE_AMOUNT_USDC_MICRO = '7550000';

function baseQuote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    recipientName: 'Nguyen Van A',
    bankBin: '970422',
    accountNumber: '123',
    amountVnd: '200000',
    amountUsdcMicro: QUOTE_AMOUNT_USDC_MICRO,
    feeMicro: '10000',
    rate: '26500',
    needsApproval: false,
    source: 'VAULT',
    ...overrides,
  };
}

/**
 * Serves `GET .../vault/balance` from `BALANCE` and `POST .../vault/pay/quote` from `quote`
 * (defaults to an amount matching `QUOTE_AMOUNT_USDC_MICRO`, i.e. "the user confirmed this many
 * USDC"), alongside whatever the test itself handles.
 */
function withFixtures(
  handler: (req: Request) => Response | Promise<Response>,
  quote: Record<string, unknown> = baseQuote(),
) {
  return fakeFetch((req) => {
    if (req.url.endsWith('/vault/balance')) return json(BALANCE);
    if (req.url.endsWith('/vault/pay/quote')) return json(quote);
    return handler(req);
  });
}

const REQUEST: PayRequest = {
  qrPayload: '00020101...',
  amountVnd: '200000',
  name: 'Coffee',
  category: 'COFFEE',
  shareWithUserIds: [],
};

function stubWallet(publicKey = SIGNER) {
  const sign = jest.fn(async (base64Tx: string) => `signed:${base64Tx}`);
  const ensureWallet = jest.fn(async () => publicKey);
  setWalletHandle({
    kind: 'privy',
    isConfigured: true,
    isReady: true,
    connectedAddress: null,
    ensureWallet,
    connect: ensureWallet,
    sign,
    reset: jest.fn(async () => undefined),
  });
  return { publicKey, sign };
}

beforeEach(() => {
  verifyMock.mockReset();
  verifyTokenTransferMock.mockReset();
  stubWallet();
});

afterEach(() => {
  _resetWalletHandleForTests();
});

describe('lookupVaultRecipient / quoteVaultPayment', () => {
  it('POSTs to the recipient lookup path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ recipientName: 'Nguyen Van A', bankBin: '970422', accountNumber: '123' });
      }),
    );
    const result = await lookupVaultRecipient(5, 'qr-payload', api);
    expect(result.recipientName).toBe('Nguyen Van A');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/pay/recipient');
    expect(await calls[0]!.json()).toEqual({ qrPayload: 'qr-payload' });
  });

  it('POSTs the quote request and returns needsApproval', async () => {
    const api = createApiClient('http://x', fakeFetch(() => json(baseQuote({ needsApproval: true }))));
    const quote = await quoteVaultPayment(5, { qrPayload: 'qr', amountVnd: '200000' }, api);
    expect(quote.needsApproval).toBe(true);
  });

  it('throws VaultPayError on a non-2xx response', async () => {
    const api = createApiClient('http://x', fakeFetch(() => json({ message: 'Forbidden' }, 403)));
    await expect(lookupVaultRecipient(5, 'qr', api)).rejects.toBeInstanceOf(VaultPayError);
  });
});

describe('payVault — VAULT source, below threshold', () => {
  it('verifies against the spend discriminator with the quoted amount, signs and submits', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      withFixtures((req) => {
        calls.push(req);
        if (req.url.endsWith('/vault/pay/prepare')) {
          return json({
            base64Tx: 'unsigned-tx',
            vaultTransactionId: 42,
            needsApproval: false,
            source: 'VAULT',
            amountUsdcMicro: QUOTE_AMOUNT_USDC_MICRO,
          });
        }
        return json({ status: 'CONFIRMED' });
      }),
    );
    const wallet = stubWallet();
    const outcome = await payVault({ tripId: TRIP_ID, request: REQUEST, api });

    expect(outcome).toEqual({ kind: 'confirmed', vaultTransactionId: 42 });
    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledWith({
      base64: 'unsigned-tx',
      expectedProgramId: VAULT_PROGRAM_ID,
      expectedDiscriminator: VAULT_DISCRIMINATORS.spend,
      expectedAmountMicro: BigInt(QUOTE_AMOUNT_USDC_MICRO),
      expectedAccounts: [VAULT_PDA, 'spendRecipientAta', SIGNER, VAULT_ATA],
    });
    expect(wallet.sign).toHaveBeenCalledWith('unsigned-tx');
    const submitCall = calls.find((c) => c.url.endsWith('/vault/pay/42/submit'));
    expect(submitCall).toBeDefined();
    expect(await submitCall!.json()).toEqual({ signedTx: 'signed:unsigned-tx' });
  });

  it('returns pending when the server has not confirmed yet', async () => {
    const api = createApiClient(
      'http://x',
      withFixtures((req) =>
        req.url.endsWith('/vault/pay/prepare')
          ? json({
              base64Tx: 'unsigned-tx',
              vaultTransactionId: 1,
              needsApproval: false,
              source: 'VAULT',
              amountUsdcMicro: QUOTE_AMOUNT_USDC_MICRO,
            })
          : json({ status: 'PENDING' }),
      ),
    );
    const outcome = await payVault({ tripId: TRIP_ID, request: REQUEST, api });
    expect(outcome).toEqual({ kind: 'pending', vaultTransactionId: 1 });
  });
});

// A larger, still-realistic VND amount for tests that need headroom above the ~7.5 USDC default
// while staying inside the FX_VND_PER_USDC_MIN..MAX sanity band (rate here ≈ 25,000 VND/USDC).
const LARGE_AMOUNT_VND = '5000000';
const LARGE_AMOUNT_USDC_MICRO = '200000000';

describe('payVault — above threshold (propose → approve)', () => {
  it('verifies against proposeSpend with the quoted amount and returns awaitingApproval', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      withFixtures(
        (req) => {
          calls.push(req);
          if (req.url.endsWith('/vault/pay/prepare')) {
            return json({
              base64Tx: 'unsigned-propose',
              vaultTransactionId: 7,
              needsApproval: true,
              source: 'VAULT',
              amountUsdcMicro: LARGE_AMOUNT_USDC_MICRO,
            });
          }
          return json({ status: 'CONFIRMED' });
        },
        baseQuote({
          amountVnd: LARGE_AMOUNT_VND,
          needsApproval: true,
          amountUsdcMicro: LARGE_AMOUNT_USDC_MICRO,
        }),
      ),
    );
    const outcome = await payVault({
      tripId: TRIP_ID,
      request: { ...REQUEST, amountVnd: LARGE_AMOUNT_VND },
      api,
    });

    expect(outcome).toEqual({ kind: 'awaitingApproval', vaultTransactionId: 7 });
    expect(verifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDiscriminator: VAULT_DISCRIMINATORS.proposeSpend,
        expectedAmountMicro: BigInt(LARGE_AMOUNT_USDC_MICRO),
        expectedAccounts: [VAULT_PDA, 'spendRecipientAta', SIGNER],
      }),
    );
    // Still submits: the proposer's signature is their own approval on chain.
    expect(calls.some((c) => c.url.endsWith('/vault/pay/7/submit'))).toBe(true);
  });
});

describe('payVault — PERSONAL source', () => {
  it('checks a token transfer with the quoted amount instead of a vault instruction', async () => {
    const api = createApiClient(
      'http://x',
      withFixtures(
        (req) =>
          req.url.endsWith('/vault/pay/prepare')
            ? json({
                base64Tx: 'unsigned-personal',
                vaultTransactionId: 3,
                needsApproval: false,
                source: 'PERSONAL',
                amountUsdcMicro: QUOTE_AMOUNT_USDC_MICRO,
                payerAta: 'myUsdcAta',
              })
            : json({ status: 'CONFIRMED' }),
        baseQuote({ source: 'PERSONAL' }),
      ),
    );
    stubWallet(SIGNER);
    const outcome = await payVault({
      tripId: TRIP_ID,
      request: { ...REQUEST, source: 'PERSONAL' },
      api,
    });

    expect(outcome).toEqual({ kind: 'confirmed', vaultTransactionId: 3 });
    expect(verifyMock).not.toHaveBeenCalled();
    expect(verifyTokenTransferMock).toHaveBeenCalledWith({
      base64: 'unsigned-personal',
      expectedAmountMicro: BigInt(QUOTE_AMOUNT_USDC_MICRO),
      // Derived from the local key — the server's `payerAta` ('myUsdcAta') is ignored.
      expectedSource: SIGNER_ATA,
      expectedDestination: 'spendRecipientAta',
      expectedOwner: SIGNER,
    });
  });
});

describe('payVault — security: prepare must agree with the independently-quoted amount/source', () => {
  it('rejects and abandons when prepare returns a different amount than the user-confirmed quote', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      withFixtures((req) => {
        calls.push(req);
        if (req.url.endsWith('/vault/pay/prepare')) {
          // Server tries to sneak through a bigger spend than what was quoted.
          return json({
            base64Tx: 'unsigned-tx',
            vaultTransactionId: 55,
            needsApproval: false,
            source: 'VAULT',
            amountUsdcMicro: '999999999999',
          });
        }
        if (req.url.endsWith('/vault/pay/55/abandon')) return json({}, 201);
        throw new Error('unexpected call: ' + req.url);
      }),
    );

    await expect(payVault({ tripId: TRIP_ID, request: REQUEST, api })).rejects.toBeInstanceOf(
      VaultPaySecurityError,
    );
    expect(verifyMock).not.toHaveBeenCalled();
    expect(calls.some((c) => c.url.endsWith('/vault/pay/55/abandon'))).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/submit'))).toBe(false);
  });

  it('rejects and abandons when prepare returns a different source than requested', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      withFixtures((req) => {
        calls.push(req);
        if (req.url.endsWith('/vault/pay/prepare')) {
          // Requested VAULT, server tries to drain the caller's own wallet instead.
          return json({
            base64Tx: 'unsigned-tx',
            vaultTransactionId: 56,
            needsApproval: false,
            source: 'PERSONAL',
            amountUsdcMicro: QUOTE_AMOUNT_USDC_MICRO,
            payerAta: 'myUsdcAta',
          });
        }
        if (req.url.endsWith('/vault/pay/56/abandon')) return json({}, 201);
        throw new Error('unexpected call: ' + req.url);
      }),
    );

    await expect(payVault({ tripId: TRIP_ID, request: REQUEST, api })).rejects.toBeInstanceOf(
      VaultPaySecurityError,
    );
    expect(verifyMock).not.toHaveBeenCalled();
    expect(verifyTokenTransferMock).not.toHaveBeenCalled();
    expect(calls.some((c) => c.url.endsWith('/vault/pay/56/abandon'))).toBe(true);
  });
});

describe('payVault — security: FX sanity bound on the quote itself', () => {
  it('rejects a quote implying a rate below FX_VND_PER_USDC_MIN, before ever calling prepare', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      withFixtures(
        (req) => {
          calls.push(req);
          throw new Error('unexpected call: ' + req.url);
        },
        // 200,000 VND for 100 USDC implies a rate of 2,000 VND/USDC — far below the 20,000 floor.
        baseQuote({ amountUsdcMicro: '100000000' }),
      ),
    );

    await expect(payVault({ tripId: TRIP_ID, request: REQUEST, api })).rejects.toBeInstanceOf(
      VaultPaySecurityError,
    );
    expect(calls.some((c) => c.url.endsWith('/vault/pay/prepare'))).toBe(false);
  });

  it('rejects a quote implying a rate above FX_VND_PER_USDC_MAX, before ever calling prepare', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      withFixtures(
        (req) => {
          calls.push(req);
          throw new Error('unexpected call: ' + req.url);
        },
        // 200,000 VND for 0.001 USDC implies a rate of 200,000,000 VND/USDC — far above the
        // 35,000 ceiling (an order-of-magnitude-manipulated quote, the class of attack this bound
        // exists to catch even when quote and prepare would otherwise agree with each other).
        baseQuote({ amountUsdcMicro: '1000' }),
      ),
    );

    await expect(payVault({ tripId: TRIP_ID, request: REQUEST, api })).rejects.toBeInstanceOf(
      VaultPaySecurityError,
    );
    expect(calls.some((c) => c.url.endsWith('/vault/pay/prepare'))).toBe(false);
  });

  it('accepts a quote at the edge of the band', async () => {
    // 200,000 VND at exactly 35,000 VND/USDC = 5,714,285.71... micro-USDC; use the floor so the
    // check's integer division lands inside (not exactly on) the boundary.
    const edgeAmountUsdcMicro = '5714285';
    const api = createApiClient(
      'http://x',
      withFixtures(
        (req) => {
          if (req.url.endsWith('/vault/pay/prepare')) {
            return json({
              base64Tx: 'unsigned-tx',
              vaultTransactionId: 60,
              needsApproval: false,
              source: 'VAULT',
              amountUsdcMicro: edgeAmountUsdcMicro,
            });
          }
          return json({ status: 'CONFIRMED' });
        },
        baseQuote({ amountUsdcMicro: edgeAmountUsdcMicro }),
      ),
    );

    await expect(payVault({ tripId: TRIP_ID, request: REQUEST, api })).resolves.toEqual({
      kind: 'confirmed',
      vaultTransactionId: 60,
    });
  });
});

describe('payVault — abandon on failure after prepare', () => {
  it('abandons the prepared row and rethrows when verification refuses to sign', async () => {
    const calls: Request[] = [];
    verifyMock.mockImplementation(() => {
      throw new Error('discriminator mismatch');
    });
    const api = createApiClient(
      'http://x',
      withFixtures((req) => {
        calls.push(req);
        if (req.url.endsWith('/vault/pay/prepare')) {
          return json({
            base64Tx: 'unsigned-tx',
            vaultTransactionId: 9,
            needsApproval: false,
            source: 'VAULT',
            amountUsdcMicro: QUOTE_AMOUNT_USDC_MICRO,
          });
        }
        if (req.url.endsWith('/vault/pay/9/abandon')) return json({}, 201);
        throw new Error('unexpected call: ' + req.url);
      }),
    );

    await expect(payVault({ tripId: TRIP_ID, request: REQUEST, api })).rejects.toThrow(
      'discriminator mismatch',
    );

    expect(calls.some((c) => c.url.endsWith('/vault/pay/9/abandon'))).toBe(true);
    // Never reaches submit: no signature was produced.
    expect(calls.some((c) => c.url.endsWith('/submit'))).toBe(false);
  });
});

describe('payVault — abandon only before a signature exists (C7)', () => {
  const prepareResponse = (id: number) => ({
    base64Tx: 'unsigned-tx',
    vaultTransactionId: id,
    needsApproval: false,
    source: 'VAULT',
    amountUsdcMicro: QUOTE_AMOUNT_USDC_MICRO,
  });

  it('does NOT abandon when the submit fails after the transaction was signed', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      withFixtures((req) => {
        calls.push(req);
        if (req.url.endsWith('/vault/pay/prepare')) return json(prepareResponse(70));
        if (req.url.endsWith('/vault/pay/70/submit')) return json({ message: 'boom' }, 500);
        throw new Error('unexpected call: ' + req.url);
      }),
    );
    const wallet = stubWallet();

    await expect(payVault({ tripId: TRIP_ID, request: REQUEST, api })).rejects.toBeInstanceOf(
      VaultPayError,
    );

    expect(wallet.sign).toHaveBeenCalled();
    expect(calls.some((c) => c.url.endsWith('/vault/pay/70/submit'))).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/abandon'))).toBe(false);
  });

  it('abandons when signing itself fails (no signature was produced)', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      withFixtures((req) => {
        calls.push(req);
        if (req.url.endsWith('/vault/pay/prepare')) return json(prepareResponse(71));
        if (req.url.endsWith('/vault/pay/71/abandon')) return json({}, 201);
        throw new Error('unexpected call: ' + req.url);
      }),
    );
    const wallet = stubWallet();
    wallet.sign.mockRejectedValueOnce(new Error('user cancelled'));

    await expect(payVault({ tripId: TRIP_ID, request: REQUEST, api })).rejects.toThrow();

    expect(calls.some((c) => c.url.endsWith('/vault/pay/71/abandon'))).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/submit'))).toBe(false);
  });
});

describe('payVault — real verifier rejects a server-built transaction aimed at the wrong vault (C1)', () => {
  // A valid pubkey for the payout receiver ATA (the one account still read from the server).
  const RECEIVER_ATA = 'BKUBw58cLFJenv2hVGJVhgza6qeBqMizf4J2kJJasWG2';
  const OTHER_TRIP_VAULT = deriveVaultPda(TRIP_ID + 1, VAULT_PROGRAM_ID);
  const OTHER_TRIP_ATA = deriveAssociatedTokenAddress(OTHER_TRIP_VAULT, VAULT_USDC_MINT);

  /** A `spend` transaction whose accounts are exactly `accounts` (in instruction order). */
  function spendTx(accounts: string[]): string {
    const { decodeBase58 } = jest.requireActual('../solana/transactionVerifier') as {
      decodeBase58: (v: string) => Uint8Array;
    };
    const keys = [VAULT_PROGRAM_ID, ...accounts];
    const amount = BigInt(QUOTE_AMOUNT_USDC_MICRO);
    const data = [
      ...VAULT_DISCRIMINATORS.spend,
      ...Array.from({ length: 8 }, (_, i) => Number((amount >> BigInt(8 * i)) & 0xffn)),
    ];
    const bytes: number[] = [1, ...new Array(64).fill(0), 1, 0, 1, keys.length];
    for (const k of keys) bytes.push(...decodeBase58(k));
    bytes.push(...new Array(32).fill(7), 1, 0, accounts.length);
    bytes.push(...accounts.map((_, i) => i + 1), data.length, ...data);
    return base64Encode(new Uint8Array(bytes));
  }

  function apiFor(base64Tx: string, calls: Request[]) {
    return createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        if (req.url.endsWith('/vault/balance')) return json({ ...BALANCE, spendRecipientAta: RECEIVER_ATA });
        if (req.url.endsWith('/vault/pay/quote')) return json(baseQuote());
        if (req.url.endsWith('/vault/pay/prepare')) {
          return json({
            base64Tx,
            vaultTransactionId: 80,
            needsApproval: false,
            source: 'VAULT',
            amountUsdcMicro: QUOTE_AMOUNT_USDC_MICRO,
          });
        }
        if (req.url.endsWith('/abandon')) return json({}, 201);
        return json({ status: 'CONFIRMED' });
      }),
    );
  }

  beforeEach(() => {
    const actual = jest.requireActual('../solana/transactionVerifier') as typeof transactionVerifier;
    verifyMock.mockImplementation(actual.verify);
  });

  it('signs a transaction against the client-derived vault', async () => {
    const calls: Request[] = [];
    const api = apiFor(spendTx([VAULT_PDA, RECEIVER_ATA, SIGNER, VAULT_ATA]), calls);
    const wallet = stubWallet();

    await expect(payVault({ tripId: TRIP_ID, request: REQUEST, api })).resolves.toEqual({
      kind: 'confirmed',
      vaultTransactionId: 80,
    });
    expect(wallet.sign).toHaveBeenCalledTimes(1);
  });

  it('refuses to sign a transaction against another trip’s vault, whatever the balance response says', async () => {
    const calls: Request[] = [];
    const api = apiFor(spendTx([OTHER_TRIP_VAULT, RECEIVER_ATA, SIGNER, OTHER_TRIP_ATA]), calls);
    const wallet = stubWallet();

    await expect(payVault({ tripId: TRIP_ID, request: REQUEST, api })).rejects.toThrow();

    expect(wallet.sign).not.toHaveBeenCalled();
    expect(calls.some((c) => c.url.endsWith('/submit'))).toBe(false);
    // Nothing was signed, so the prepared row is retired.
    expect(calls.some((c) => c.url.endsWith('/vault/pay/80/abandon'))).toBe(true);
  });

  it('refuses a transaction whose signer is not the local key', async () => {
    const calls: Request[] = [];
    const api = apiFor(spendTx([VAULT_PDA, RECEIVER_ATA, OTHER_TRIP_VAULT, VAULT_ATA]), calls);
    const wallet = stubWallet();

    await expect(payVault({ tripId: TRIP_ID, request: REQUEST, api })).rejects.toThrow();
    expect(wallet.sign).not.toHaveBeenCalled();
  });
});

describe('approveVaultTransaction', () => {
  it('verifies against approveSpend (no amount arg on this instruction — see file header)', async () => {
    const api = createApiClient(
      'http://x',
      withFixtures((req) => {
        if (req.url.endsWith('/vault/pay/7/approve')) return json({ base64Tx: 'unsigned-approve' });
        return json({ status: 'CONFIRMED' });
      }),
    );
    const outcome = await approveVaultTransaction({ tripId: TRIP_ID, vaultTransactionId: 7, api });

    expect(outcome).toEqual({ kind: 'confirmed', vaultTransactionId: 7 });
    expect(verifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDiscriminator: VAULT_DISCRIMINATORS.approveSpend,
        expectedAmountMicro: null,
        expectedAccounts: [VAULT_PDA, 'spendRecipientAta', SIGNER, VAULT_ATA],
      }),
    );
  });
});

describe('cancelVaultTransaction', () => {
  it('verifies against cancelSpend and submits to the cancel/submit path, not pay/submit', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      withFixtures((req) => {
        calls.push(req);
        if (req.url.endsWith('/vault/pay/7/cancel')) return json({ base64Tx: 'unsigned-cancel' });
        return json({}, 201);
      }),
    );
    await cancelVaultTransaction({ tripId: TRIP_ID, vaultTransactionId: 7, api });

    expect(verifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDiscriminator: VAULT_DISCRIMINATORS.cancelSpend,
        expectedAccounts: [VAULT_PDA, SIGNER],
      }),
    );
    expect(calls.some((c) => c.url.endsWith('/vault/pay/7/cancel/submit'))).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/vault/pay/7/submit'))).toBe(false);
  });

  it('surfaces a 403 (proposer/host/co-host only) as a classified VaultPayError', async () => {
    const api = createApiClient(
      'http://x',
      withFixtures(() =>
        json({ message: 'Only the proposer or a host may cancel this payment' }, 403),
      ),
    );
    let thrown: unknown;
    try {
      await cancelVaultTransaction({ tripId: TRIP_ID, vaultTransactionId: 7, api });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(VaultPayError);
    expect(vaultPayErrorMessage(thrown, 'fallback')).toBe(
      'Only the proposer or a host may cancel this payment',
    );
  });
});

describe('invalidateVaultPay', () => {
  it('invalidates balance, history and settlement for the trip', async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await invalidateVaultPay(qc, 5);
    const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidated).toEqual([
      keys.vault.balance(5),
      keys.vault.history(5),
      keys.vault.settlement(5),
    ]);
  });
});
