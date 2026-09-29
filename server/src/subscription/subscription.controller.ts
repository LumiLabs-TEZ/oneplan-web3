import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { GooglePubSubGuard } from './guards/google-pubsub.guard';
import { SubscriptionStatusDto } from './dto/subscription-status.dto';
import { AppAccountTokenDto } from './dto/app-account-token.dto';
import { ValidateTransactionDto } from './dto/validate-transaction.dto';
import { VerifyPlayPurchaseDto } from './dto/verify-play-purchase.dto';
import { PlayWebhookPayloadDto } from './dto/play-webhook-payload.dto';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { SubscriptionService } from './subscription.service';

@ApiTags('Subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('validate')
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'validateSubscriptionTransaction',
    summary: 'Validate a JWS transaction from StoreKit 2',
  })
  @ApiOkResponse({
    type: SubscriptionStatusDto,
    description: 'Subscription status after validation',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid transaction or subscription validation not configured',
  })
  validateTransaction(
    @CurrentUser('sub') userId: number,
    @Body() dto: ValidateTransactionDto,
  ): Promise<SubscriptionStatusDto> {
    return this.subscriptionService.validateTransaction(userId, dto.jws);
  }

  @Post('play/verify')
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'verifyPlayPurchase',
    summary: 'Verify and acknowledge a Google Play purchase',
  })
  @ApiOkResponse({
    type: SubscriptionStatusDto,
    description: 'Subscription status after Play verification',
  })
  @ApiBadRequestResponse({
    description: 'Invalid Play purchase or Play verification not configured',
  })
  verifyPlayPurchase(
    @CurrentUser('sub') userId: number,
    @Body() dto: VerifyPlayPurchaseDto,
  ): Promise<SubscriptionStatusDto> {
    return this.subscriptionService.verifyPlayPurchase(userId, dto);
  }

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'getSubscriptionStatus',
    summary: 'Get current subscription status',
  })
  @ApiOkResponse({
    type: SubscriptionStatusDto,
    description: 'Current subscription status',
  })
  getStatus(
    @CurrentUser('sub') userId: number,
  ): Promise<SubscriptionStatusDto> {
    return this.subscriptionService.getSubscriptionStatus(userId);
  }

  @Get('app-account-token')
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'getSubscriptionAppAccountToken',
    summary: 'Get the StoreKit app account token for the current user',
  })
  @ApiOkResponse({
    type: AppAccountTokenDto,
    description: 'Stable StoreKit app account token',
  })
  getAppAccountToken(
    @CurrentUser('sub') userId: number,
  ): Promise<AppAccountTokenDto> {
    return this.subscriptionService.getAppAccountToken(userId);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'syncSubscriptionStatus',
    summary: 'Refresh the linked subscription status from the App Store',
  })
  @ApiOkResponse({
    type: SubscriptionStatusDto,
    description: 'Current subscription status after synchronization',
  })
  @ApiBadRequestResponse({
    description: 'No supported linked subscription found',
  })
  @ApiServiceUnavailableResponse({
    description: 'App Store subscription synchronization unavailable',
  })
  syncStatus(
    @CurrentUser('sub') userId: number,
  ): Promise<SubscriptionStatusDto> {
    return this.subscriptionService.syncSubscriptionStatus(userId);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'handleSubscriptionWebhook',
    summary: 'Handle App Store Server Notification V2',
  })
  @ApiOkResponse({ description: 'Webhook processed successfully' })
  @ApiBadRequestResponse({ description: 'Invalid notification or signature' })
  async handleWebhook(
    @Body() body: WebhookPayloadDto,
  ): Promise<{ status: string }> {
    await this.subscriptionService.handleWebhook(body.signedPayload);
    return { status: 'ok' };
  }

  @Public()
  @UseGuards(GooglePubSubGuard)
  @Post('play/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'handlePlaySubscriptionWebhook',
    summary:
      'Handle Google Play Real-Time Developer Notifications (RTDN) via Pub/Sub',
  })
  @ApiOkResponse({ description: 'Webhook processed successfully' })
  async handlePlayWebhook(
    @Body() body: PlayWebhookPayloadDto,
  ): Promise<{ status: string }> {
    await this.subscriptionService.handlePlayWebhook(body);
    return { status: 'ok' };
  }
}
