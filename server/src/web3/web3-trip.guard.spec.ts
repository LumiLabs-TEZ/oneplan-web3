import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Web3TripGuard } from './web3-trip.guard';

function ctx(tripId: string, ip = '8.8.8.8'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip, params: { tripId }, user: { sub: 7 } }),
    }),
  } as never;
}

function guard(trip: { web3: boolean } | null, eligible = true) {
  const prisma = { trip: { findUnique: jest.fn().mockResolvedValue(trip) } };
  const eligibility = { isEligible: jest.fn().mockResolvedValue(eligible) };
  return new Web3TripGuard(prisma as never, eligibility as never);
}

describe('Web3TripGuard', () => {
  it('lets an eligible member through on a web3 trip', async () => {
    await expect(guard({ web3: true }).canActivate(ctx('5'))).resolves.toBe(
      true,
    );
  });

  it('403s web3_unavailable for a non-eligible (VN) IP even on a web3 trip', async () => {
    const err = await guard({ web3: true }, false)
      .canActivate(ctx('5', '113.161.1.1'))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: 'web3_unavailable',
    });
  });

  it('passes the caller id so an allowlisted VN member gets through', async () => {
    const prisma = {
      trip: { findUnique: jest.fn().mockResolvedValue({ web3: true }) },
    };
    const eligibility = { isEligible: jest.fn().mockResolvedValue(true) };
    const g = new Web3TripGuard(prisma as never, eligibility as never);
    await expect(g.canActivate(ctx('5', '113.161.1.1'))).resolves.toBe(true);
    expect(eligibility.isEligible).toHaveBeenCalledWith('113.161.1.1', 7);
  });

  it('404s vault calls on a non-web3 trip', async () => {
    await expect(guard({ web3: false }).canActivate(ctx('5'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('404s an unknown trip', async () => {
    await expect(guard(null).canActivate(ctx('5'))).rejects.toThrow(
      NotFoundException,
    );
  });
});
