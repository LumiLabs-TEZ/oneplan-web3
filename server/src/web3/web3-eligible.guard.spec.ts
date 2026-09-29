import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Web3EligibleGuard } from './web3-eligible.guard';

const ctx = (ip: string): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ ip }) }) }) as never;

describe('Web3EligibleGuard', () => {
  const build = (eligible: boolean) =>
    new Web3EligibleGuard({
      isEligible: jest.fn().mockReturnValue(eligible),
    } as never);

  it('passes an eligible IP', () => {
    expect(build(true).canActivate(ctx('8.8.8.8'))).toBe(true);
  });

  it('403s web3_unavailable otherwise', () => {
    expect(() => build(false).canActivate(ctx('113.161.1.1'))).toThrow(
      ForbiddenException,
    );
  });
});
