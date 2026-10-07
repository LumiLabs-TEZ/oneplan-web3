import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Web3EligibleGuard } from './web3-eligible.guard';

const ctx = (ip: string, sub = 7): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ ip, user: { sub } }) }),
  }) as never;

describe('Web3EligibleGuard', () => {
  const build = (eligible: boolean) => {
    const isEligible = jest.fn().mockResolvedValue(eligible);
    return {
      isEligible,
      guard: new Web3EligibleGuard({ isEligible } as never),
    };
  };

  it('passes an eligible caller, checking IP and user id', async () => {
    const { guard, isEligible } = build(true);
    await expect(guard.canActivate(ctx('113.161.1.1', 42))).resolves.toBe(true);
    expect(isEligible).toHaveBeenCalledWith('113.161.1.1', 42);
  });

  it('403s web3_unavailable otherwise', async () => {
    await expect(
      build(false).guard.canActivate(ctx('113.161.1.1')),
    ).rejects.toThrow(ForbiddenException);
  });
});
