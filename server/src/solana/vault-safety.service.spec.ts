import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Keypair } from '@solana/web3.js';

import { VaultSafetyService } from './vault-safety.service';

const ATA = Keypair.generate().publicKey.toBase58();

function build(
  vault: { status: string } | null,
  balance: bigint | Error = 0n,
  extra: {
    owned?: { id: number }[];
    stranded?: { id: number } | null;
  } = {},
) {
  const prisma = {
    tripVault: {
      findUnique: jest
        .fn()
        .mockResolvedValue(vault ? { usdcAta: ATA, ...vault } : null),
    },
    trip: { findMany: jest.fn().mockResolvedValue(extra.owned ?? []) },
    vaultTransaction: {
      findFirst: jest.fn().mockResolvedValue(extra.stranded ?? null),
    },
  };
  const solana = {
    getTokenBalance: jest
      .fn()
      .mockImplementation(() =>
        balance instanceof Error
          ? Promise.reject(balance)
          : Promise.resolve(balance),
      ),
  };
  return {
    service: new VaultSafetyService(prisma as never, solana as never),
    prisma,
    solana,
  };
}

describe('VaultSafetyService.assertTripDeletable (S10)', () => {
  it('allows a trip that never had a vault', async () => {
    const { service, solana } = build(null);
    await expect(service.assertTripDeletable(1)).resolves.toBeUndefined();
    expect(solana.getTokenBalance).not.toHaveBeenCalled();
  });

  it('skips a CLOSED vault without reading its (closed) token account', async () => {
    const { service, solana } = build(
      { status: 'CLOSED' },
      new Error('could not find account'),
    );
    await expect(service.assertTripDeletable(1)).resolves.toBeUndefined();
    expect(solana.getTokenBalance).not.toHaveBeenCalled();
  });

  it('treats a missing token account as empty instead of a permanent 500', async () => {
    const { service } = build(
      { status: 'ACTIVE' },
      new Error('Invalid param: could not find account'),
    );
    await expect(service.assertTripDeletable(1)).resolves.toBeUndefined();
  });

  it('blocks while the vault holds funds', async () => {
    const { service } = build({ status: 'ACTIVE' }, 500_000n);
    await expect(service.assertTripDeletable(1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('fails closed but retryable (503) when the RPC is down', async () => {
    const { service } = build({ status: 'ACTIVE' }, new Error('429 Too Many'));
    await expect(service.assertTripDeletable(1)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('VaultSafetyService.assertEndableWithoutConsensus (S5)', () => {
  it('lets a classic trip end with a plain status change', async () => {
    const { service } = build(null);
    await expect(
      service.assertEndableWithoutConsensus(1),
    ).resolves.toBeUndefined();
  });

  it('refuses while a vault is open — that path skips end-consensus and strands the USDC', async () => {
    const { service } = build({ status: 'ACTIVE' });
    await expect(service.assertEndableWithoutConsensus(1)).rejects.toThrow(
      /end-trip vote/,
    );
  });

  it('allows once the vault is settled and closed', async () => {
    const { service } = build({ status: 'CLOSED' });
    await expect(
      service.assertEndableWithoutConsensus(1),
    ).resolves.toBeUndefined();
  });
});

describe('VaultSafetyService.assertAccountDeletable (S5)', () => {
  it('checks every owned vault trip with the trip-deletion rule', async () => {
    const { service, solana } = build({ status: 'ACTIVE' }, 1n, {
      owned: [{ id: 1 }, { id: 2 }],
    });
    await expect(service.assertAccountDeletable(9)).rejects.toThrow(
      /Settle or withdraw/,
    );
    expect(solana.getTokenBalance).toHaveBeenCalled();
  });

  it('refuses while the user has deposits in someone else’s open vault (their ledger would be orphaned)', async () => {
    const { service, prisma } = build(null, 0n, { stranded: { id: 5 } });
    await expect(service.assertAccountDeletable(9)).rejects.toThrow(
      /Leave your trips/,
    );
    expect(prisma.vaultTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 9,
          kind: 'DEPOSIT',
          status: 'CONFIRMED',
        }),
      }),
    );
  });

  it('allows a user with no vault exposure', async () => {
    const { service } = build(null);
    await expect(service.assertAccountDeletable(9)).resolves.toBeUndefined();
  });
});
