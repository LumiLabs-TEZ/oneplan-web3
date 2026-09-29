// Prevent jose (ESM-only) from loading, as auth.service.spec.ts does.
jest.mock('./apple-auth.service', () => ({ AppleAuthService: jest.fn() }));
jest.mock('./google-auth.service', () => ({ GoogleAuthService: jest.fn() }));

import { BadRequestException } from '@nestjs/common';

import { AuthService } from './auth.service';

/**
 * S5: deleting an account cascades the user's trips (and their vaults) and
 * orphans their deposits in other people's vaults. The guard must run before
 * anything is archived or deleted.
 */
describe('AuthService.deleteAccount vault guard', () => {
  function build(guard: () => Promise<void>) {
    const prisma = { $transaction: jest.fn() };
    const vaultSafety = {
      assertAccountDeletable: jest.fn().mockImplementation(guard),
    };
    const service = new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      vaultSafety as never,
    );
    return { service, prisma, vaultSafety };
  }

  it('blocks deletion, touching nothing, when money would be stranded', async () => {
    const { service, prisma, vaultSafety } = build(() =>
      Promise.reject(new BadRequestException('Settle or withdraw')),
    );

    await expect(service.deleteAccount(7)).rejects.toThrow(BadRequestException);

    expect(vaultSafety.assertAccountDeletable).toHaveBeenCalledWith(7);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('proceeds to the deletion transaction when the guard passes', async () => {
    const { service, prisma } = build(() => Promise.resolve());
    prisma.$transaction.mockResolvedValue({ photoUrls: [], listingCovers: [] });

    await service.deleteAccount(7);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
