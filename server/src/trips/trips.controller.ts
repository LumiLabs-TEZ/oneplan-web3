import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Web3EligibilityService } from '../web3/web3-eligibility.service';
import { Web3EligibleGuard } from '../web3/web3-eligible.guard';
import { Web3EnabledGuard } from '../solana/web3-enabled.guard';
import { TripEndConsensusService } from './trip-end-consensus.service';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { InviteMembersDto } from './dto/invite-members.dto';
import { RespondInviteDto } from './dto/respond-invite.dto';
import { TripDto } from './dto/trip.dto';
import { TripSummaryDto } from './dto/trip-summary.dto';
import { SetMemberRoleDto } from './dto/set-member-role.dto';
import { TripMemberDto } from './dto/trip-member.dto';
import { InvitePreviewDto } from './dto/invite-preview.dto';
import { PendingTripInviteDto } from './dto/pending-invite.dto';
import {
  LeavePreviewDto,
  LeaveSettlementDto,
  VaultLeaveClearResultDto,
  VaultLeaveAnnounceResultDto,
  VaultLeaveConfirmResultDto,
  VaultLeaveRequestListDto,
} from './dto/leave-preview.dto';
import { StartTripConflictErrorDto } from './dto/member-conflict.dto';
import {
  CastTripEndVoteDto,
  TripEndRequestDto,
  TripEndReviewDto,
} from './dto/trip-end-consensus.dto';

@ApiBearerAuth()
@ApiTags('Trips')
@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly tripEndConsensus: TripEndConsensusService,
    private readonly web3Eligibility: Web3EligibilityService,
  ) {}

  @Post()
  @ApiOperation({ operationId: 'createTrip', summary: 'Create a new trip' })
  @ApiCreatedResponse({ type: TripDto })
  createTrip(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateTripDto,
    @Req() req: FastifyRequest,
  ): Promise<TripDto> {
    // No opt-in in the create flow: an eligible creator's trip is a web3 trip.
    return this.tripsService.createTrip(
      userId,
      dto,
      this.web3Eligibility.isEligible(req.ip),
    );
  }

  @Get()
  @ApiOperation({
    operationId: 'listMyTrips',
    summary: 'List my trips with optional status filter',
  })
  @ApiOkResponse({ type: [TripSummaryDto] })
  listMyTrips(
    @CurrentUser('sub') userId: number,
    @Query() query: ListTripsQueryDto,
  ): Promise<TripSummaryDto[]> {
    return this.tripsService.listMyTrips(userId, query.status);
  }

  @Post('join/:inviteCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'joinTrip',
    summary: 'Join a trip via invite code',
  })
  @ApiParam({ name: 'inviteCode', type: 'string' })
  @ApiOkResponse({ type: TripDto })
  @ApiNotFoundResponse({ description: 'Invalid invite code' })
  joinTrip(
    @CurrentUser('sub') userId: number,
    @Param('inviteCode') inviteCode: string,
    @Req() req: FastifyRequest,
  ): Promise<TripDto> {
    return this.tripsService.joinTrip(
      inviteCode,
      userId,
      this.web3Eligibility.isEligible(req.ip),
    );
  }

  @Get('join/:inviteCode/preview')
  @ApiOperation({
    operationId: 'getInvitePreview',
    summary: 'Get trip preview by invite code',
  })
  @ApiParam({ name: 'inviteCode', type: 'string' })
  @ApiOkResponse({ type: InvitePreviewDto })
  @ApiNotFoundResponse({ description: 'Invalid invite code' })
  getInvitePreview(
    @CurrentUser('sub') userId: number,
    @Param('inviteCode') inviteCode: string,
    @Req() req: FastifyRequest,
  ): Promise<InvitePreviewDto> {
    return this.tripsService.getInvitePreview(
      inviteCode,
      userId,
      this.web3Eligibility.isEligible(req.ip),
    );
  }

  @Get('invites/pending')
  @ApiOperation({
    operationId: 'listPendingTripInvites',
    summary: 'List my pending trip invitations',
  })
  @ApiOkResponse({ type: [PendingTripInviteDto] })
  listPendingInvites(
    @CurrentUser('sub') userId: number,
  ): Promise<PendingTripInviteDto[]> {
    return this.tripsService.listPendingInvites(userId);
  }

  @Get(':id/leave-preview')
  @ApiOperation({
    operationId: 'getLeavePreview',
    summary: 'Preview what happens when the current user leaves the trip',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: LeavePreviewDto })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  getLeavePreview(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<LeavePreviewDto> {
    return this.tripsService.getLeavePreview(id, userId);
  }

  @Post(':id/members/:userId/vault-leave-clear')
  @UseGuards(Web3EnabledGuard, Web3EligibleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'clearVaultLeave',
    summary:
      'Host marks a member vault debt cleared off-chain so they may leave',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiParam({ name: 'userId', type: 'integer' })
  @ApiOkResponse({ type: VaultLeaveClearResultDto })
  clearVaultLeave(
    @CurrentUser('sub') currentUserId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<VaultLeaveClearResultDto> {
    return this.tripsService.clearVaultLeave(id, userId, currentUserId);
  }

  @Post(':id/vault-leave/announce')
  @UseGuards(Web3EnabledGuard, Web3EligibleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'announceVaultLeave',
    summary: 'Member announces leave after net >= 0; host must confirm',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: VaultLeaveAnnounceResultDto })
  announceVaultLeave(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<VaultLeaveAnnounceResultDto> {
    return this.tripsService.announceVaultLeave(id, userId);
  }

  @Get(':id/vault-leave/requests')
  @UseGuards(Web3EnabledGuard, Web3EligibleGuard)
  @ApiOperation({
    operationId: 'listVaultLeaveRequests',
    summary: 'Host: pending vault leave announcements',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: VaultLeaveRequestListDto })
  listVaultLeaveRequests(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<VaultLeaveRequestListDto> {
    return this.tripsService.listVaultLeaveRequests(id, userId);
  }

  @Post(':id/vault-leave/requests/:userId/confirm')
  @UseGuards(Web3EnabledGuard, Web3EligibleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'confirmVaultLeave',
    summary:
      'Host confirms leave (on-chain payout_leave when net > 0) and removes the member',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiParam({ name: 'userId', type: 'integer' })
  @ApiOkResponse({ type: VaultLeaveConfirmResultDto })
  confirmVaultLeave(
    @CurrentUser('sub') hostUserId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<VaultLeaveConfirmResultDto> {
    return this.tripsService.confirmVaultLeave(id, userId, hostUserId);
  }

  @Post(':id/end-request')
  @UseGuards(Web3EnabledGuard, Web3EligibleGuard)
  @ApiOperation({
    operationId: 'requestTripEnd',
    summary:
      'Creator starts vault end-trip consensus for all members to review',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: TripEndRequestDto })
  @ApiConflictResponse({ description: 'An end request is already pending' })
  @ApiForbiddenResponse({ description: 'Only the creator can request end' })
  requestTripEnd(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TripEndRequestDto> {
    return this.tripEndConsensus.requestEnd(id, userId);
  }

  @Get(':id/end-request')
  @UseGuards(Web3EnabledGuard, Web3EligibleGuard)
  @ApiOperation({
    operationId: 'getTripEndRequest',
    summary: 'Current end-trip consensus request and vote summary',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: TripEndRequestDto })
  @ApiNotFoundResponse({ description: 'No end request' })
  getTripEndRequest(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TripEndRequestDto> {
    return this.tripEndConsensus.getRequest(id, userId);
  }

  @Get(':id/end-request/review')
  @UseGuards(Web3EnabledGuard, Web3EligibleGuard)
  @ApiOperation({
    operationId: 'getTripEndReview',
    summary: 'Ledger + settlement preview for end-trip Approve/Deny',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: TripEndReviewDto })
  getTripEndReview(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TripEndReviewDto> {
    return this.tripEndConsensus.getReview(id, userId);
  }

  @Post(':id/end-request/vote')
  @UseGuards(Web3EnabledGuard, Web3EligibleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'castTripEndVote',
    summary: 'Approve or deny a pending vault end-trip request',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: TripEndRequestDto })
  castTripEndVote(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CastTripEndVoteDto,
  ): Promise<TripEndRequestDto> {
    return this.tripEndConsensus.castVote(id, userId, dto.decision);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getTrip', summary: 'Get trip details' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: TripDto })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  getTrip(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TripDto> {
    return this.tripsService.getTrip(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ operationId: 'updateTrip', summary: 'Update a trip' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: TripDto })
  @ApiBadRequestResponse({
    description: 'Members have ongoing trip conflicts',
    type: StartTripConflictErrorDto,
  })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  updateTrip(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTripDto,
  ): Promise<TripDto> {
    return this.tripsService.updateTrip(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'deleteTrip', summary: 'Delete a trip' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Only the creator can delete a trip' })
  deleteTrip(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.tripsService.deleteTrip(id, userId);
  }

  @Post(':id/invite')
  @ApiOperation({
    operationId: 'inviteMembers',
    summary: 'Invite members to a trip',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiCreatedResponse({ type: [TripMemberDto] })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  inviteMembers(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InviteMembersDto,
  ): Promise<TripMemberDto[]> {
    return this.tripsService.inviteMembers(id, userId, dto);
  }

  @Patch(':id/members/respond')
  @ApiOperation({
    operationId: 'respondToInvite',
    summary: 'Accept or decline a trip invitation',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: TripMemberDto })
  @ApiNotFoundResponse({ description: 'No invitation found' })
  respondToInvite(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RespondInviteDto,
    @Req() req: FastifyRequest,
  ): Promise<TripMemberDto> {
    return this.tripsService.respondToInvite(
      id,
      userId,
      dto,
      this.web3Eligibility.isEligible(req.ip),
    );
  }

  @Patch(':id/members/:userId/role')
  @ApiOperation({
    operationId: 'setMemberRole',
    summary: 'Appoint or remove a co-host',
  })
  @ApiParam({ name: 'id', type: 'integer', description: 'Trip ID' })
  @ApiParam({ name: 'userId', type: 'integer', description: 'User ID' })
  @ApiOkResponse({ type: TripMemberDto })
  @ApiForbiddenResponse({ description: 'Only the creator can change roles' })
  setMemberRole(
    @CurrentUser('sub') currentUserId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: SetMemberRoleDto,
  ): Promise<TripMemberDto> {
    return this.tripsService.setMemberRole(id, userId, currentUserId, dto.role);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'removeMember',
    summary: 'Remove a member or leave a trip',
  })
  @ApiParam({ name: 'id', type: 'integer', description: 'Trip ID' })
  @ApiParam({
    name: 'userId',
    type: 'integer',
    description: 'User ID to remove',
  })
  @ApiOkResponse({ type: LeaveSettlementDto })
  @ApiForbiddenResponse({ description: 'Only the creator can remove members' })
  removeMember(
    @CurrentUser('sub') currentUserId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<LeaveSettlementDto> {
    return this.tripsService.removeMember(id, userId, currentUserId);
  }
}
