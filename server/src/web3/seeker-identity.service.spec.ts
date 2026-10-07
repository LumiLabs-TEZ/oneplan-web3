import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletProvider } from '@prisma/client';
import { Keypair, PublicKey } from '@solana/web3.js';

import {
  FAILURE_BACKOFF_MS,
  MAX_CONCURRENT_REFRESHES,
  SEEKER_GENESIS_GROUP,
  SEEKER_GENESIS_MINT_AUTHORITY,
  SeekerIdentityService,
  exposedIdentity,
  pickSkrLabel,
} from './seeker-identity.service';

const tldParser = {
  getParsedAllUserDomainsFromTld: jest.fn<
    Promise<unknown>,
    [PublicKey, string]
  >(),
};
jest.mock('@onsol/tldparser', () => ({ TldParser: jest.fn(() => tldParser) }));

const memberState = jest.fn<unknown, [PublicKey]>();
const mintAuthorityOf = jest.fn<PublicKey, [PublicKey]>();
const pointerState = jest.fn<unknown, [PublicKey]>();
jest.mock('@solana/spl-token', () => ({
  ...jest.requireActual<object>('@solana/spl-token'),
  unpackMint: jest.fn((address: PublicKey) => ({
    address,
    mintAuthority: mintAuthorityOf(address),
  })),
  getMetadataPointerState: (mint: { address: PublicKey }) =>
    pointerState(mint.address),
  getTokenGroupMemberState: (mint: { address: PublicKey }) =>
    memberState(mint.address),
}));

type Conn = Record<string, jest.Mock>;

function service(rpc = 'https://mainnet.example') {
  const prisma = {
    walletAccount: { findUnique: jest.fn(), updateMany: jest.fn() },
  };
  const s = new SeekerIdentityService(
    new ConfigService({ SOLANA_MAINNET_RPC_URL: rpc }),
    prisma as never,
  );
  const conn = (s as unknown as { connection: Conn | null }).connection;
  return { s, prisma, conn };
}

function tokenAccount(mint: PublicKey, amount: string) {
  return {
    account: {
      data: {
        parsed: { info: { mint: mint.toBase58(), tokenAmount: { amount } } },
      },
    },
  };
}

/** Background work resolves through mocked promises only; one macrotask drains it. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  // Default: every mint satisfies all five SGT conditions; tests break one at a time.
  mintAuthorityOf.mockReturnValue(SEEKER_GENESIS_MINT_AUTHORITY);
  pointerState.mockReturnValue({
    authority: SEEKER_GENESIS_MINT_AUTHORITY,
    metadataAddress: SEEKER_GENESIS_GROUP,
  });
  memberState.mockImplementation((mint: PublicKey) => ({
    group: SEEKER_GENESIS_GROUP,
    mint,
  }));
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

describe('SeekerIdentityService', () => {
  it('finds the SGT mint among non-empty Token-2022 accounts', async () => {
    const { s, conn } = service();
    const sgt = Keypair.generate().publicKey;
    const other = Keypair.generate().publicKey;
    const empty = Keypair.generate().publicKey;
    conn!.getParsedTokenAccountsByOwner = jest.fn().mockResolvedValue({
      value: [
        tokenAccount(other, '1'),
        tokenAccount(empty, '0'),
        tokenAccount(sgt, '1'),
      ],
    });
    conn!.getMultipleAccountsInfo = jest.fn().mockResolvedValue([{}, {}]);
    memberState.mockImplementation((mint: PublicKey) =>
      mint.equals(sgt)
        ? { group: SEEKER_GENESIS_GROUP, mint }
        : { group: Keypair.generate().publicKey, mint },
    );
    await expect(s.findGenesisMint(Keypair.generate().publicKey)).resolves.toBe(
      sgt.toBase58(),
    );
    // The zero-balance account (a transferred-away SGT) is never even fetched.
    const [fetched] = conn!.getMultipleAccountsInfo.mock.calls[0] as [
      PublicKey[],
    ];
    expect(fetched).toHaveLength(2);
  });

  describe('SGT conditions (each one alone must reject)', () => {
    const other = () => Keypair.generate().publicKey;
    const cases: [string, (mint: PublicKey) => void][] = [
      ['mint authority', () => mintAuthorityOf.mockReturnValue(other())],
      [
        'metadata pointer authority',
        () =>
          pointerState.mockReturnValue({
            authority: other(),
            metadataAddress: SEEKER_GENESIS_GROUP,
          }),
      ],
      [
        'metadata pointer address',
        () =>
          pointerState.mockReturnValue({
            authority: SEEKER_GENESIS_MINT_AUTHORITY,
            metadataAddress: other(),
          }),
      ],
      ['missing metadata pointer', () => pointerState.mockReturnValue(null)],
      [
        'group',
        (mint) => memberState.mockReturnValue({ group: other(), mint }),
      ],
      [
        'member mint',
        () =>
          memberState.mockReturnValue({
            group: SEEKER_GENESIS_GROUP,
            mint: other(),
          }),
      ],
      ['missing group member', () => memberState.mockReturnValue(null)],
    ];

    it.each(cases)('rejects a wrong %s', async (_name, breakIt) => {
      const { s, conn } = service();
      const fake = other();
      conn!.getParsedTokenAccountsByOwner = jest
        .fn()
        .mockResolvedValue({ value: [tokenAccount(fake, '1')] });
      conn!.getMultipleAccountsInfo = jest.fn().mockResolvedValue([{}]);
      // Sanity: with nothing broken the same mint is accepted.
      await expect(s.findGenesisMint(other())).resolves.toBe(fake.toBase58());
      breakIt(fake);
      await expect(s.findGenesisMint(other())).resolves.toBeNull();
    });
  });

  it('skips a mint whose extension data fails to decode and keeps looking', async () => {
    const { s, conn } = service();
    const malformed = Keypair.generate().publicKey;
    const sgt = Keypair.generate().publicKey;
    conn!.getParsedTokenAccountsByOwner = jest.fn().mockResolvedValue({
      value: [tokenAccount(malformed, '1'), tokenAccount(sgt, '1')],
    });
    conn!.getMultipleAccountsInfo = jest.fn().mockResolvedValue([{}, {}]);
    // e.g. a TLV layout the installed spl-token cannot decode.
    pointerState.mockImplementation((mint: PublicKey) => {
      if (mint.equals(malformed)) throw new RangeError('buffer overrun');
      return {
        authority: SEEKER_GENESIS_MINT_AUTHORITY,
        metadataAddress: SEEKER_GENESIS_GROUP,
      };
    });
    await expect(s.findGenesisMint(Keypair.generate().publicKey)).resolves.toBe(
      sgt.toBase58(),
    );
  });

  it('checks more than 100 token accounts in batches of 100', async () => {
    const { s, conn } = service();
    const mints = Array.from(
      { length: 150 },
      () => Keypair.generate().publicKey,
    );
    const sgt = mints[120];
    conn!.getParsedTokenAccountsByOwner = jest.fn().mockResolvedValue({
      value: mints.map((m) => tokenAccount(m, '1')),
    });
    conn!.getMultipleAccountsInfo = jest
      .fn()
      .mockImplementation((keys: PublicKey[]) =>
        Promise.resolve(keys.map(() => ({}))),
      );
    memberState.mockImplementation((mint: PublicKey) => ({
      group: mint.equals(sgt)
        ? SEEKER_GENESIS_GROUP
        : Keypair.generate().publicKey,
      mint,
    }));
    await expect(s.findGenesisMint(Keypair.generate().publicKey)).resolves.toBe(
      sgt.toBase58(),
    );
    const sizes = conn!.getMultipleAccountsInfo.mock.calls.map(
      ([keys]) => (keys as PublicKey[]).length,
    );
    expect(sizes).toEqual([100, 50]);
  });

  it('caps a lookup at 1000 non-empty accounts and logs it', async () => {
    const { s, conn } = service();
    const mints = Array.from(
      { length: 1005 },
      () => Keypair.generate().publicKey,
    );
    conn!.getParsedTokenAccountsByOwner = jest.fn().mockResolvedValue({
      value: mints.map((m) => tokenAccount(m, '1')),
    });
    conn!.getMultipleAccountsInfo = jest
      .fn()
      .mockImplementation((keys: PublicKey[]) =>
        Promise.resolve(keys.map(() => null)),
      );
    const warn = jest.spyOn(Logger.prototype, 'warn');
    await expect(
      s.findGenesisMint(Keypair.generate().publicKey),
    ).resolves.toBeNull();
    expect(conn!.getMultipleAccountsInfo).toHaveBeenCalledTimes(10);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1005'));
  });

  it('returns null when no account is an SGT', async () => {
    const { s, conn } = service();
    conn!.getParsedTokenAccountsByOwner = jest
      .fn()
      .mockResolvedValue({ value: [] });
    await expect(
      s.findGenesisMint(Keypair.generate().publicKey),
    ).resolves.toBeNull();
  });

  it('picks the alphabetically first .skr label deterministically, suffix stripped', () => {
    expect(
      pickSkrLabel([
        { domain: 'zed.skr' },
        { domain: 'alice.skr' },
        { domain: 'bob' },
      ]),
    ).toBe('alice');
    expect(pickSkrLabel([])).toBeNull();
  });

  it('drops reverse lookups that found nothing or carry padding', () => {
    // tldparser builds `${domain}.skr` even when the reverse-lookup account is missing.
    expect(
      pickSkrLabel([{ domain: 'undefined.skr' }, { domain: 'carol\0\0.skr' }]),
    ).toBe('carol');
    expect(pickSkrLabel([{ domain: 'undefined.skr' }])).toBeNull();
    expect(pickSkrLabel([{ domain: `${'a'.repeat(65)}.skr` }])).toBeNull();
  });

  it('findSkrDomain asks the parser for the skr TLD of the owner', async () => {
    const { s } = service();
    const owner = Keypair.generate().publicKey;
    tldParser.getParsedAllUserDomainsFromTld.mockResolvedValue([
      { nameAccount: owner, domain: 'dave.skr' },
    ]);
    await expect(s.findSkrDomain(owner)).resolves.toBe('dave');
    expect(tldParser.getParsedAllUserDomainsFromTld).toHaveBeenCalledWith(
      owner,
      'skr',
    );
  });

  it('refreshInBackground is a no-op without a mainnet RPC', () => {
    const { s, prisma } = service('');
    s.refreshInBackground(7);
    expect(prisma.walletAccount.findUnique).not.toHaveBeenCalled();
  });

  it('refreshes an MWA wallet and writes only to the same key and provider', async () => {
    const { s, prisma } = service();
    const owner = Keypair.generate().publicKey.toBase58();
    prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: owner,
      provider: WalletProvider.MWA,
    });
    jest.spyOn(s, 'findGenesisMint').mockResolvedValue('MintAddr');
    jest.spyOn(s, 'findSkrDomain').mockResolvedValue(null);
    s.refreshInBackground(7);
    await flush();
    expect(prisma.walletAccount.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, publicKey: owner, provider: WalletProvider.MWA },
      data: {
        seekerGenesisMint: 'MintAddr',
        seekerCheckedAt: expect.any(Date) as Date,
        skrDomain: null,
        skrCheckedAt: expect.any(Date) as Date,
      },
    });
  });

  it('never looks up a PRIVY wallet: its key was linked without proof', async () => {
    const { s, prisma } = service();
    prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: Keypair.generate().publicKey.toBase58(),
      provider: WalletProvider.PRIVY,
    });
    const genesis = jest.spyOn(s, 'findGenesisMint');
    const skr = jest.spyOn(s, 'findSkrDomain');
    s.refreshInBackground(7);
    await flush();
    expect(genesis).not.toHaveBeenCalled();
    expect(skr).not.toHaveBeenCalled();
    expect(prisma.walletAccount.updateMany).not.toHaveBeenCalled();
  });

  it('a failed lookup leaves that field unchecked and never throws', async () => {
    const { s, prisma } = service();
    prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: Keypair.generate().publicKey.toBase58(),
      provider: WalletProvider.MWA,
    });
    jest.spyOn(s, 'findGenesisMint').mockRejectedValue(new Error('429'));
    jest.spyOn(s, 'findSkrDomain').mockResolvedValue('erin');
    expect(() => s.refreshInBackground(7)).not.toThrow();
    await flush();
    const [args] = prisma.walletAccount.updateMany.mock.calls[0] as [
      { data: unknown },
    ];
    expect(args.data).toEqual({
      skrDomain: 'erin',
      skrCheckedAt: expect.any(Date) as Date,
    });
  });

  it('skips the write when both lookups fail, and swallows a DB error', async () => {
    const { s, prisma } = service();
    prisma.walletAccount.findUnique.mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(Logger.prototype, 'warn');
    s.refreshInBackground(7);
    await flush();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('user 7'));

    prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 8,
      publicKey: Keypair.generate().publicKey.toBase58(),
      provider: WalletProvider.MWA,
    });
    jest.spyOn(s, 'findGenesisMint').mockRejectedValue(new Error('429'));
    jest.spyOn(s, 'findSkrDomain').mockRejectedValue(new Error('429'));
    s.refreshInBackground(8);
    await flush();
    expect(prisma.walletAccount.updateMany).not.toHaveBeenCalled();
  });

  it('backs off a user for FAILURE_BACKOFF_MS after a failed lookup', async () => {
    const { s, prisma } = service();
    prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: Keypair.generate().publicKey.toBase58(),
      provider: WalletProvider.MWA,
    });
    const genesis = jest
      .spyOn(s, 'findGenesisMint')
      .mockRejectedValue(new Error('429'));
    jest.spyOn(s, 'findSkrDomain').mockResolvedValue(null);
    const start = 1_000_000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(start);

    s.refreshInBackground(7);
    await flush();
    expect(genesis).toHaveBeenCalledTimes(1);

    // Inside the window: no DB read, no RPC.
    now.mockReturnValue(start + FAILURE_BACKOFF_MS - 1);
    s.refreshInBackground(7);
    await flush();
    expect(genesis).toHaveBeenCalledTimes(1);
    expect(prisma.walletAccount.findUnique).toHaveBeenCalledTimes(1);

    // Window over: tries again, and a success clears the backoff.
    now.mockReturnValue(start + FAILURE_BACKOFF_MS);
    genesis.mockResolvedValue(null);
    s.refreshInBackground(7);
    await flush();
    expect(genesis).toHaveBeenCalledTimes(2);
    s.refreshInBackground(7);
    await flush();
    expect(genesis).toHaveBeenCalledTimes(3);
    now.mockRestore();
  });

  it('backs off after a DB error too', async () => {
    const { s, prisma } = service();
    prisma.walletAccount.findUnique.mockRejectedValue(new Error('db down'));
    s.refreshInBackground(7);
    await flush();
    s.refreshInBackground(7);
    await flush();
    expect(prisma.walletAccount.findUnique).toHaveBeenCalledTimes(1);
  });

  it('refreshStaleInBackground refreshes only stale or unchecked MWA rows', () => {
    const { s } = service();
    const refresh = jest
      .spyOn(s, 'refreshInBackground')
      .mockImplementation(() => undefined);
    const day = 24 * 60 * 60 * 1000;
    const old = new Date(Date.now() - 2 * day);
    const fresh = () => new Date();
    s.refreshStaleInBackground([
      {
        userId: 1,
        provider: WalletProvider.MWA,
        seekerCheckedAt: null,
        skrCheckedAt: null,
      },
      {
        userId: 2,
        provider: WalletProvider.MWA,
        seekerCheckedAt: old,
        skrCheckedAt: old,
      },
      {
        userId: 3,
        provider: WalletProvider.MWA,
        seekerCheckedAt: fresh(),
        skrCheckedAt: fresh(),
      },
      {
        userId: 4,
        provider: WalletProvider.PRIVY,
        seekerCheckedAt: null,
        skrCheckedAt: null,
      },
      // The mint lookup succeeded but .skr failed (null) or went stale: retry.
      {
        userId: 5,
        provider: WalletProvider.MWA,
        seekerCheckedAt: fresh(),
        skrCheckedAt: null,
      },
      {
        userId: 6,
        provider: WalletProvider.MWA,
        seekerCheckedAt: fresh(),
        skrCheckedAt: old,
      },
    ]);
    expect(refresh.mock.calls.map(([id]) => id)).toEqual([1, 2, 5, 6]);
  });

  it('retries a failed .skr lookup on the next stale check while the mint stays checked', async () => {
    const { s, prisma } = service();
    const owner = Keypair.generate().publicKey.toBase58();
    prisma.walletAccount.findUnique.mockResolvedValue({
      userId: 7,
      publicKey: owner,
      provider: WalletProvider.MWA,
    });
    jest.spyOn(s, 'findGenesisMint').mockResolvedValue('MintAddr');
    jest.spyOn(s, 'findSkrDomain').mockRejectedValue(new Error('429'));
    s.refreshInBackground(7);
    await flush();
    const [args] = prisma.walletAccount.updateMany.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    // Only the mint half was stamped, so skrCheckedAt stays null and the row remains stale.
    expect(args.data).toEqual({
      seekerGenesisMint: 'MintAddr',
      seekerCheckedAt: expect.any(Date) as Date,
    });
    const refresh = jest
      .spyOn(s, 'refreshInBackground')
      .mockImplementation(() => undefined);
    s.refreshStaleInBackground([
      {
        userId: 7,
        provider: WalletProvider.MWA,
        seekerCheckedAt: new Date(),
        skrCheckedAt: null,
      },
    ]);
    expect(refresh).toHaveBeenCalledWith(7);
  });

  it('skips (does not queue) a refresh beyond the concurrency cap', async () => {
    const { s, prisma } = service();
    const release: (() => void)[] = [];
    prisma.walletAccount.findUnique.mockImplementation(
      () =>
        new Promise((resolve) => {
          release.push(() =>
            resolve({
              userId: 0,
              publicKey: Keypair.generate().publicKey.toBase58(),
              provider: WalletProvider.PRIVY,
            }),
          );
        }),
    );
    for (let id = 1; id <= MAX_CONCURRENT_REFRESHES + 1; id += 1) {
      s.refreshInBackground(id);
    }
    expect(prisma.walletAccount.findUnique).toHaveBeenCalledTimes(
      MAX_CONCURRENT_REFRESHES,
    );
    // A slot frees up: the skipped user is served by a later request, not a queue.
    release[0]();
    await flush();
    s.refreshInBackground(MAX_CONCURRENT_REFRESHES + 1);
    expect(prisma.walletAccount.findUnique).toHaveBeenCalledTimes(
      MAX_CONCURRENT_REFRESHES + 1,
    );
    release.forEach((r) => r());
    await flush();
  });
});

describe('exposedIdentity', () => {
  it('exposes stored identity for an MWA row', () => {
    expect(
      exposedIdentity({
        provider: WalletProvider.MWA,
        skrDomain: 'alice',
        seekerGenesisMint: 'Mint',
      }),
    ).toEqual({ skrDomain: 'alice', isSeeker: true });
  });

  it('hides stored identity on a PRIVY row', () => {
    expect(
      exposedIdentity({
        provider: WalletProvider.PRIVY,
        skrDomain: 'alice',
        seekerGenesisMint: 'Mint',
      }),
    ).toEqual({ skrDomain: null, isSeeker: false });
  });
});
