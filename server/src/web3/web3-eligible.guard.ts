import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { Web3EligibilityService } from './web3-eligibility.service';

export const WEB3_UNAVAILABLE_CODE = 'web3_unavailable';

export function web3UnavailableException(): ForbiddenException {
  return new ForbiddenException({
    code: WEB3_UNAVAILABLE_CODE,
    message: 'Web3 features are not available here',
  });
}

/**
 * 403 `{ code: 'web3_unavailable' }` unless the caller is web3-eligible (request
 * IP, or the user is on the admin allowlist).
 */
export async function assertWeb3Eligible(
  eligibility: Web3EligibilityService,
  ip: string | undefined,
  userId: number | undefined,
): Promise<void> {
  if (!(await eligibility.isEligible(ip, userId))) {
    throw web3UnavailableException();
  }
}

/**
 * Every web3 surface is invisible to a non-eligible caller (e.g. a Vietnamese
 * IP not on the allowlist), including inside a web3 trip made by someone else.
 * Data is untouched; only access depends on the request IP and the allowlist.
 * Runs after the global JwtAuthGuard, so `req.user` is set.
 */
@Injectable()
export class Web3EligibleGuard implements CanActivate {
  constructor(private readonly eligibility: Web3EligibilityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: JwtPayload }>();
    await assertWeb3Eligible(this.eligibility, req.ip, req.user?.sub);
    return true;
  }
}
