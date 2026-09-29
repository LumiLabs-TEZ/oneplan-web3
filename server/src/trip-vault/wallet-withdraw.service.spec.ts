import { BadRequestException } from '@nestjs/common';
import { Keypair, PublicKey } from '@solana/web3.js';

import { WalletWithdrawService } from './wallet-withdraw.service';

/**
 * A withdrawal is one transfer and cannot be undone, so what is worth testing
 * is not the transfer but everything that refuses to make one.
 */
function build(
  overrides: {
    balanceMicro?: bigint;
    configured?: boolean;
    recent?: { amountMicro: bigint; createsRecipientAccount: boolean }[];
    settings?: Record<string, number>;
  } = {},
) {
  const owner = Keypair.generate().publicKey;
  const withdrawalCreate = jest.fn();
  const tx = {
    $executeRaw: jest.fn(),
    walletWithdrawal: {
      findMany: jest.fn().mockResolvedValue(overrides.recent ?? []),
      create: withdrawalCreate,
    },
  };
  const prisma = {
    walletAccount: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ userId: 7, publicKey: owner.toBase58() }),
    },
    $transaction: jest.fn((run: (t: typeof tx) => Promise<void>) => run(tx)),
  };
  const config = {
    get: (key: string, fallback?: number) =>
      overrides.settings?.[key] ?? fallback,
  };
  const solana = {
    isConfigured: overrides.configured ?? true,
    usdcMint: Keypair.generate().publicKey,
    feePayer: Keypair.generate(),
    connection: {
      // Recipient token account exists unless a test says otherwise.
      getAccountInfo: jest.fn().mockResolvedValue({}),
    },
    getTokenBalance: jest
      .fn()
      .mockResolvedValue(overrides.balanceMicro ?? 100_000_000n),
    buildUnsignedTx: jest.fn().mockResolvedValue('base64tx'),
  };
  return {
    service: new WalletWithdrawService(
      prisma as never,
      solana as never,
      config as never,
    ),
    owner,
    solana,
    prisma,
    withdrawalCreate,
  };
}

describe('WalletWithdrawService', () => {
  // The mistake this refuses by name. USDC sent to an Ethereum address on
  // Solana is gone, and the message has to say which chain the wallet is on.
  it('refuses an Ethereum address', async () => {
    const { service } = build();
    await expect(
      service.buildWithdrawal(
        7,
        '0xd35Cd6F11e1Fc6A0E0dC33Db6fF9A2b8fA1eAd3g',
        1n,
      ),
    ).rejects.toThrow(/Ethereum/);
  });

  it('refuses something that is not an address at all', async () => {
    const { service } = build();
    await expect(service.buildWithdrawal(7, 'hello', 1n)).rejects.toThrow(
      BadRequestException,
    );
  });

  // Off-curve keys belong to programs. Nobody holds their private key, so
  // anything sent there stays there.
  it('refuses a program address', async () => {
    const { service } = build();
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('seed')],
      Keypair.generate().publicKey,
    );
    await expect(
      service.buildWithdrawal(7, pda.toBase58(), 1n),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses this wallet as its own recipient', async () => {
    const { service, owner } = build();
    await expect(
      service.buildWithdrawal(7, owner.toBase58(), 1n),
    ).rejects.toThrow(/this wallet/i);
  });

  it('refuses more than the wallet holds', async () => {
    const { service } = build({ balanceMicro: 5_000_000n });
    await expect(
      service.buildWithdrawal(
        7,
        Keypair.generate().publicKey.toBase58(),
        6_000_000n,
      ),
    ).rejects.toThrow(/more than/i);
  });

  it('refuses nothing at all', async () => {
    const { service } = build();
    await expect(
      service.buildWithdrawal(7, Keypair.generate().publicKey.toBase58(), 0n),
    ).rejects.toThrow(BadRequestException);
  });

  // S9: 1-micro withdrawals to fresh addresses were a free SOL drain — every
  // one made the fee payer open a token account (~0.002 SOL rent).
  describe('S9: limits and gating', () => {
    const fresh = () => Keypair.generate().publicKey.toBase58();

    it('refuses an amount below the per-user minimum', async () => {
      const { service, withdrawalCreate } = build();
      await expect(
        service.buildWithdrawal(7, fresh(), 999_999n),
      ).rejects.toThrow(/minimum withdrawal/i);
      expect(withdrawalCreate).not.toHaveBeenCalled();
    });

    it('the minimum is configurable', async () => {
      const { service } = build({
        settings: { WALLET_WITHDRAW_MIN_MICRO: 10_000_000 },
      });
      await expect(
        service.buildWithdrawal(7, fresh(), 5_000_000n),
      ).rejects.toThrow(/minimum withdrawal/i);
    });

    it('books an allowed withdrawal against the rolling daily allowance', async () => {
      const { service, withdrawalCreate, prisma } = build();
      const result = await service.buildWithdrawal(7, fresh(), 2_000_000n);

      expect(result.base64Tx).toBe('base64tx');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(withdrawalCreate).toHaveBeenCalledWith({
        data: {
          userId: 7,
          amountMicro: 2_000_000n,
          createsRecipientAccount: result.createsRecipientAccount,
        },
      });
    });

    it('refuses once the daily cap would be exceeded, and returns no transaction', async () => {
      const { service, withdrawalCreate } = build({
        recent: [{ amountMicro: 999_000_000n, createsRecipientAccount: false }],
      });
      await expect(
        service.buildWithdrawal(7, fresh(), 2_000_000n),
      ).rejects.toThrow(/Daily withdrawal limit/);
      expect(withdrawalCreate).not.toHaveBeenCalled();
    });

    it('limits how many new recipient accounts one member can make the fee payer open', async () => {
      const { service, withdrawalCreate } = build({
        recent: Array.from({ length: 5 }, () => ({
          amountMicro: 1_000_000n,
          createsRecipientAccount: true,
        })),
      });
      // connection.getAccountInfo is not enough for getAccount(): it throws
      // here, so this withdrawal would open a new recipient account.
      await expect(
        service.buildWithdrawal(7, fresh(), 1_000_000n),
      ).rejects.toThrow(/new addresses/);
      expect(withdrawalCreate).not.toHaveBeenCalled();
    });

    it('is gated on the server being configured', async () => {
      const { service } = build({ configured: false });
      await expect(
        service.buildWithdrawal(7, fresh(), 2_000_000n),
      ).rejects.toThrow(/not configured/);
      await expect(service.submitWithdrawal('tx')).rejects.toThrow(
        /not configured/,
      );
    });
  });
});
