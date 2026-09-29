import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import { assertWeb3Eligible } from './web3-eligible.guard';
import { Web3EligibilityService } from './web3-eligibility.service';

/**
 * Vault routes need a web3 trip AND a web3-eligible request IP (403
 * `web3_unavailable` otherwise — a Vietnamese member of a foreigner's web3 trip
 * sees no web3). Membership is left to the service layer (assertMember).
 */
@Injectable()
export class Web3TripGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: Web3EligibilityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest<{ Params: { tripId?: string } }>>();
    assertWeb3Eligible(this.eligibility, req.ip);
    const tripId = Number(req.params?.tripId);
    if (!Number.isInteger(tripId)) return true; // ParseIntPipe answers 400
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { web3: true },
    });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    if (!trip.web3) {
      // 404 (not 400): to the client a non-web3 trip is just "no vault", the
      // same answer it already handles for a web2 trip that never had one.
      throw new NotFoundException('This trip does not use a group wallet');
    }
    return true;
  }
}
