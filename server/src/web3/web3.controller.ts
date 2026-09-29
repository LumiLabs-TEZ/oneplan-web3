import { Controller, Get, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Web3EligibilityDto } from './web3.dto';
import { Web3EligibilityService } from './web3-eligibility.service';

@ApiTags('web3')
@ApiBearerAuth()
@Controller('web3')
export class Web3Controller {
  constructor(private readonly eligibility: Web3EligibilityService) {}

  // Not behind Web3EnabledGuard: a dark server answers 200 {false,false} so
  // the client can hide every web3 surface instead of handling a 404.
  @Get('eligibility')
  @ApiOperation({
    operationId: 'getWeb3Eligibility',
    summary: 'Whether web3 surfaces apply to the caller',
  })
  @ApiOkResponse({ type: Web3EligibilityDto })
  async getEligibility(
    @CurrentUser('sub') userId: number,
    @Req() req: FastifyRequest,
  ): Promise<Web3EligibilityDto> {
    return {
      eligible: this.eligibility.isEligible(req.ip),
      hasWeb3Trip: await this.eligibility.hasWeb3Trip(userId),
    };
  }
}
