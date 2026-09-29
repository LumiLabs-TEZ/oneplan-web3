import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { MissionConfigService } from './mission-config.service';
import {
  MissionSettingsDto,
  UpdateMissionSettingsDto,
} from './dto/mission-settings.dto';

// Admin editor for the mission/shop numbers (rewards, caps, prices) — applies
// live via MissionConfigService, no redeploy. Same shape as admin/telegram.
@ApiTags('admin-missions')
@Controller('admin/missions')
export class MissionsAdminController {
  constructor(private readonly config: MissionConfigService) {}

  @Get('settings')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminGetMissionSettings',
    summary:
      'Mission rewards/caps and shop prices: effective values, defaults, override flags.',
  })
  @ApiOkResponse({ type: MissionSettingsDto })
  async getSettings(): Promise<MissionSettingsDto> {
    return this.config.getAdminView();
  }

  @Put('settings')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminUpdateMissionSettings',
    summary:
      'Override mission rewards/caps or shop prices (null resets to the code default). Applies live.',
  })
  @ApiOkResponse({ type: MissionSettingsDto })
  async updateSettings(
    @Body() body: UpdateMissionSettingsDto,
  ): Promise<MissionSettingsDto> {
    return this.config.update(body);
  }
}
