import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Web3EnabledGuard } from '../solana/web3-enabled.guard';
import { FaucetClaimDto } from './dto/faucet.dto';
import { Web3FaucetService } from './faucet.service';
import { Web3EligibilityDto } from './web3.dto';
import { Web3EligibilityService } from './web3-eligibility.service';
import { Web3EligibleGuard } from './web3-eligible.guard';

@ApiTags('web3')
@ApiBearerAuth()
@Controller('web3')
export class Web3Controller {
  constructor(
    private readonly eligibility: Web3EligibilityService,
    private readonly faucet: Web3FaucetService,
    private readonly config: ConfigService,
  ) {}

  /** `WEB3_MWA_ENABLED`, default on; tolerates the raw string form like the faucet flag. */
  private get mwaEnabled(): boolean {
    const flag: unknown = this.config.get('WEB3_MWA_ENABLED', true);
    return flag !== false && flag !== 'false';
  }

  // Not behind Web3EnabledGuard: a dark server answers 200 {false,false,false}
  // so the client can hide every web3 surface instead of handling a 404.
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
    const eligible = await this.eligibility.isEligible(req.ip, userId);
    return {
      eligible,
      hasWeb3Trip: await this.eligibility.hasWeb3Trip(userId),
      faucetEnabled: eligible && this.faucet.isEnabled,
      mwaEnabled: this.mwaEnabled,
    };
  }

  @Post('faucet')
  @UseGuards(Web3EnabledGuard, Web3EligibleGuard)
  @ApiOperation({
    operationId: 'claimWeb3Faucet',
    summary: 'Send devnet test USDC to the caller wallet',
  })
  @ApiCreatedResponse({ type: FaucetClaimDto })
  claimFaucet(@CurrentUser('sub') userId: number): Promise<FaucetClaimDto> {
    return this.faucet.claim(userId);
  }
}
