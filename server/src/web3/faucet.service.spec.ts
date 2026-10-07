import { HttpException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair, TransactionInstruction } from '@solana/web3.js';
import bs58 from 'bs58';

import { DEVNET_GENESIS_HASH, Web3FaucetService } from './faucet.service';

function setup(
  overrides: { enabled?: boolean; genesis?: string; balance?: bigint } = {},
) {
  const faucetKey = Keypair.generate();
  const config = new ConfigService({
    WEB3_FAUCET_ENABLED: overrides.enabled ?? true,
    SOLANA_FAUCET_SECRET_KEY: bs58.encode(faucetKey.secretKey),
    FAUCET_USDC_MICRO: 5_000_000,
  });
  const prisma = {
    walletAccount: {
      findUnique: jest.fn().mockResolvedValue({
        publicKey: Keypair.generate().publicKey.toBase58(),
      }),
    },
    web3FaucetClaim: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const solana = {
    isConfigured: true,
    usdcMint: Keypair.generate().publicKey,
    feePayer: Keypair.generate(),
    connection: {
      getGenesisHash: jest
        .fn()
        .mockResolvedValue(overrides.genesis ?? DEVNET_GENESIS_HASH),
    },
    getTokenBalance: jest
      .fn()
      .mockResolvedValue(overrides.balance ?? 100_000_000n),
    sendAsFeePayer: jest
      .fn<Promise<string>, [TransactionInstruction[], Keypair[]]>()
      .mockResolvedValue('sig111'),
  };
  const service = new Web3FaucetService(
    config,
    prisma as never,
    solana as never,
  );
  return { service, prisma, solana, faucetKey };
}

const code = (e: unknown) =>
  ((e as HttpException).getResponse() as { code?: string }).code;

describe('Web3FaucetService', () => {
  it('sends USDC from the faucet wallet and records the claim', async () => {
    const { service, prisma, solana, faucetKey } = setup();
    await expect(service.claim(7)).resolves.toEqual({
      signature: 'sig111',
      amountMicro: '5000000',
    });
    const [ixs, signers] = solana.sendAsFeePayer.mock.calls[0];
    expect(ixs).toHaveLength(2); // create-ATA-idempotent + transferChecked
    expect(signers[0].publicKey.equals(faucetKey.publicKey)).toBe(true);
    expect(prisma.web3FaucetClaim.create).toHaveBeenCalledWith({
      data: { userId: 7, amountMicro: 5_000_000n, signature: 'sig111' },
    });
  });

  it('is a 404 when disabled', async () => {
    const { service } = setup({ enabled: false });
    expect(service.isEnabled).toBe(false);
    await expect(service.claim(7)).rejects.toThrow(NotFoundException);
  });

  it('refuses to run against a non-devnet cluster', async () => {
    const { service, solana } = setup({
      genesis: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    });
    expect(code(await service.claim(7).catch((e: unknown) => e))).toBe(
      'faucet_wrong_cluster',
    );
    expect(solana.sendAsFeePayer).not.toHaveBeenCalled();
  });

  it('enforces the 24h cooldown', async () => {
    const { service, prisma } = setup();
    const claimedAt = new Date('2026-10-04T10:00:00.000Z');
    prisma.web3FaucetClaim.findFirst.mockResolvedValue({
      createdAt: claimedAt,
    });
    const err = await service.claim(7).catch((e: unknown) => e);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(code(err)).toBe('faucet_cooldown');
    expect(
      ((err as HttpException).getResponse() as { nextClaimAt?: string })
        .nextClaimAt,
    ).toBe('2026-10-05T10:00:00.000Z');
  });

  it('reports an empty faucet as 503 faucet_empty', async () => {
    const { service } = setup({ balance: 1n });
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const err = await service.claim(7).catch((e: unknown) => e);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect((err as HttpException).getStatus()).toBe(503);
    expect(code(err)).toBe('faucet_empty');
  });

  it('requires a linked wallet', async () => {
    const { service, prisma } = setup();
    prisma.walletAccount.findUnique.mockResolvedValue(null);
    expect(code(await service.claim(7).catch((e: unknown) => e))).toBe(
      'wallet_not_linked',
    );
  });

  // The transfer is confirmed on chain before the claim row is written. If that
  // write fails the user still got the money, so the claim succeeds, the gap
  // is logged loudly, and an in-memory cooldown stops a retry draining more.
  it('a claim whose row cannot be written still succeeds, is logged, and cools down', async () => {
    const { service, prisma, solana } = setup();
    prisma.web3FaucetClaim.create.mockRejectedValue(new Error('db down'));
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(service.claim(7)).resolves.toEqual({
      signature: 'sig111',
      amountMicro: '5000000',
    });
    expect(error).toHaveBeenCalledTimes(1);
    const message = String(error.mock.calls[0][0]);
    expect(message).toContain('userId=7');
    expect(message).toContain('sig111');
    expect(message).toContain('5000000');
    error.mockRestore();

    // The DB still has no claim row, but the second claim is refused.
    const err = await service.claim(7).catch((e: unknown) => e);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(code(err)).toBe('faucet_cooldown');
    expect(
      ((err as HttpException).getResponse() as { nextClaimAt?: string })
        .nextClaimAt,
    ).toEqual(expect.any(String));
    expect(solana.sendAsFeePayer).toHaveBeenCalledTimes(1);

    // Another user is unaffected.
    prisma.web3FaucetClaim.create.mockResolvedValue({});
    await expect(service.claim(8)).resolves.toEqual(
      expect.objectContaining({ signature: 'sig111' }),
    );
  });

  it('the in-memory cooldown expires after 24h', async () => {
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-10-04T10:00:00.000Z'));
    try {
      const { service, prisma, solana } = setup();
      prisma.web3FaucetClaim.create.mockRejectedValueOnce(new Error('db down'));
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      await service.claim(7);
      error.mockRestore();

      const err = await service.claim(7).catch((e: unknown) => e);
      expect(
        ((err as HttpException).getResponse() as { nextClaimAt?: string })
          .nextClaimAt,
      ).toBe('2026-10-05T10:00:00.000Z');

      now.mockReturnValue(Date.parse('2026-10-05T10:00:00.001Z'));
      await expect(service.claim(7)).resolves.toEqual(
        expect.objectContaining({ signature: 'sig111' }),
      );
      expect(solana.sendAsFeePayer).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('two concurrent taps send once', async () => {
    const { service, solana } = setup();
    const results = await Promise.allSettled([
      service.claim(7),
      service.claim(7),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(solana.sendAsFeePayer).toHaveBeenCalledTimes(1);
  });
});
