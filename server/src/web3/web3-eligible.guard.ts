import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Web3EligibilityService } from './web3-eligibility.service';

export const WEB3_UNAVAILABLE_CODE = 'web3_unavailable';

export function web3UnavailableException(): ForbiddenException {
  return new ForbiddenException({
    code: WEB3_UNAVAILABLE_CODE,
    message: 'Web3 features are not available here',
  });
}

/** 403 `{ code: 'web3_unavailable' }` unless the request IP is web3-eligible. */
export function assertWeb3Eligible(
  eligibility: Web3EligibilityService,
  ip: string | undefined,
): void {
  if (!eligibility.isEligible(ip)) throw web3UnavailableException();
}

/**
 * Every web3 surface is invisible to a non-eligible request IP (e.g. Vietnam),
 * including inside a web3 trip made by someone else. Data is untouched; only
 * access depends on the IP of the request.
 */
@Injectable()
export class Web3EligibleGuard implements CanActivate {
  constructor(private readonly eligibility: Web3EligibilityService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    assertWeb3Eligible(this.eligibility, req.ip);
    return true;
  }
}
