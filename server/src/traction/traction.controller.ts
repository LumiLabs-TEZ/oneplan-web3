import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { TractionStatsDto } from './dto/traction-stats.dto';
import { TractionService } from './traction.service';

@ApiTags('traction')
@Controller('traction')
export class TractionController {
  constructor(private readonly tractionService: TractionService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('stats')
  @ApiOperation({
    operationId: 'getTractionStats',
    summary: 'Public traction stats for the investor page (cached ~60s)',
  })
  @ApiOkResponse({ type: TractionStatsDto })
  getTractionStats(): Promise<TractionStatsDto> {
    return this.tractionService.getStats();
  }
}
