import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AppLaunchDto } from './dto/app-launch.dto';
import {
  RewardedAdGrantRequestDto,
  RewardedAdGrantResponseDto,
} from './dto/rewarded-ad.dto';
import { ScanCreditBalanceDto } from './dto/scan-credit-balance.dto';
import { ScanCreditService } from './scan-credit.service';

@ApiBearerAuth()
@ApiTags('Scan Credits')
@Controller('scan-credit')
export class ScanCreditController {
  constructor(private readonly scanCredit: ScanCreditService) {}

  @Post('app-launch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'reportAppLaunch',
    summary:
      'Reports the running app version on launch. Grants the per-version app-update scan-credit reward (once per version, when enabled and at/above the floor) and returns the updated balance.',
  })
  @ApiOkResponse({ type: ScanCreditBalanceDto })
  async appLaunch(
    @CurrentUser('sub') userId: number,
    @Body() dto: AppLaunchDto,
  ): Promise<ScanCreditBalanceDto> {
    const balance = await this.scanCredit.grantAppUpgrade(
      userId,
      dto.appVersion,
    );
    return {
      available: balance.available,
      nextProGrantAt: balance.nextProGrantAt
        ? balance.nextProGrantAt.toISOString()
        : null,
    };
  }

  @Post('rewarded-ad')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'grantRewardedAdCredit',
    summary:
      'Grants +1 scan credit after a completed rewarded ad view. Idempotent on adKey; capped at 3 grants per UTC day. granted=false with remainingToday=0 means the daily cap is exhausted.',
  })
  @ApiOkResponse({ type: RewardedAdGrantResponseDto })
  async rewardedAd(
    @CurrentUser('sub') userId: number,
    @Body() dto: RewardedAdGrantRequestDto,
  ): Promise<RewardedAdGrantResponseDto> {
    const result = await this.scanCredit.grantRewardedAd(userId, dto.adKey);
    const balance = await this.scanCredit.getBalance(userId);
    return {
      granted: result.granted,
      remainingToday: result.remainingToday,
      available: balance.available,
      nextProGrantAt: balance.nextProGrantAt
        ? balance.nextProGrantAt.toISOString()
        : null,
    };
  }
}
