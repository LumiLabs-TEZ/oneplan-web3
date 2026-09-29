import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  InsufficientSparkErrorDto,
  MissionsOverviewDto,
  RedeemResultDto,
  RedeemRewardDto,
  ReportMissionEventDto,
  ReportMissionEventResultDto,
} from './dto/missions.dto';
import { MissionsService } from './missions.service';

@ApiBearerAuth()
@ApiTags('Missions')
@Controller('missions')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get()
  @ApiOperation({
    operationId: 'getMissions',
    summary:
      'Mission catalog with per-user state, the reward shop, and the current spark (⚡) balance. The client only renders this — all completion checks are server-side.',
  })
  @ApiOkResponse({ type: MissionsOverviewDto })
  getMissions(
    @CurrentUser('sub') userId: number,
  ): Promise<MissionsOverviewDto> {
    return this.missions.getOverview(userId);
  }

  @Post('events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'reportMissionEvent',
    summary:
      'Reports a client-observed mission event (market_shared, appstore_review_opened, missions_sheet_viewed). The only client-reported mission inputs; everything else is server-verified.',
  })
  @ApiOkResponse({ type: ReportMissionEventResultDto })
  reportMissionEvent(
    @CurrentUser('sub') userId: number,
    @Body() dto: ReportMissionEventDto,
  ): Promise<ReportMissionEventResultDto> {
    return this.missions.handleClientEvent(userId, dto);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'redeemReward',
    summary:
      'Redeems a reward-shop item for spark. market_unlock requires listingId. Pro items are quarter-capped and rejected while an App Store subscription is active.',
  })
  @ApiOkResponse({ type: RedeemResultDto })
  @ApiResponse({
    status: HttpStatus.PAYMENT_REQUIRED,
    description: 'Balance below the item price.',
    type: InsufficientSparkErrorDto,
  })
  @ApiConflictResponse({
    description:
      'Quarter cap exhausted, listing already acquired, or a live App Store subscription blocks a Pro redemption.',
  })
  redeemReward(
    @CurrentUser('sub') userId: number,
    @Body() dto: RedeemRewardDto,
  ): Promise<RedeemResultDto> {
    return this.missions.redeem(userId, dto);
  }
}
