import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  AddWeb3AllowlistDto,
  Web3AllowlistEntryDto,
} from './dto/web3-allowlist.dto';
import { Web3AllowlistService } from './web3-allowlist.service';

// Users listed here are web3-eligible from any IP (bypasses the GeoIP block).
@ApiTags('Web3 Admin')
@Controller('web3/admin/allowlist')
export class Web3AllowlistAdminController {
  constructor(private readonly allowlist: Web3AllowlistService) {}

  @Get()
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminListWeb3Allowlist',
    summary: 'Web3 allowlist, newest first.',
  })
  @ApiOkResponse({ type: [Web3AllowlistEntryDto] })
  list(): Promise<Web3AllowlistEntryDto[]> {
    return this.allowlist.list();
  }

  @Post()
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminAddWeb3Allowlist',
    summary:
      'Allowlist an existing user by email: web3 is available to them from any IP.',
  })
  @ApiCreatedResponse({ type: Web3AllowlistEntryDto })
  @ApiNotFoundResponse({ description: 'No user with that email' })
  add(
    @Body() dto: AddWeb3AllowlistDto,
    @CurrentUser('email') adminEmail: string,
  ): Promise<Web3AllowlistEntryDto> {
    return this.allowlist.add(dto, adminEmail);
  }

  @Delete(':userId')
  @AdminOnly()
  @HttpCode(204)
  @ApiOperation({
    operationId: 'adminRemoveWeb3Allowlist',
    summary: 'Remove a user from the web3 allowlist.',
  })
  @ApiParam({ name: 'userId', type: 'integer' })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiNotFoundResponse({ description: 'User is not on the allowlist' })
  remove(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('email') adminEmail: string,
  ): Promise<void> {
    return this.allowlist.remove(userId, adminEmail);
  }
}
