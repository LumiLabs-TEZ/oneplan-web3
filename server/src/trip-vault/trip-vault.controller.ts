import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { VaultTxSource } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Web3EnabledGuard } from '../solana/web3-enabled.guard';
import { Web3TripGuard } from '../web3/web3-trip.guard';
import {
  DEFAULT_DAILY_LIMIT_MICRO,
  DEFAULT_THRESHOLD_MICRO,
  TripVaultService,
} from './trip-vault.service';
import { TripVaultPayService } from './trip-vault-pay.service';
import { TripVaultHistoryService } from './trip-vault-history.service';
import { TripVaultSettlementService } from './trip-vault-settlement.service';
import { CreateVaultDto, VaultCreatedDto } from './dto/create-vault.dto';
import { LinkWalletDto, LinkWalletResponseDto } from './dto/link-wallet.dto';
import { MemberIdentityDto } from './dto/member-identity.dto';
import { VaultBalanceDto } from './dto/vault-balance.dto';
import { WalletBalanceDto } from './dto/wallet-balance.dto';
import { PayQuoteDto, PayQuoteRequestDto } from './dto/pay-quote.dto';
import { LookupRecipientDto, RecipientDto } from './dto/recipient.dto';
import {
  DepositRequestDto,
  DepositResultDto,
  PreparePaymentDto,
  PreparePaymentResponseDto,
  SubmitDepositDto,
  SubmitResultDto,
  SubmitSignedDto,
  SyncMembersResultDto,
  UnsignedTxDto,
} from './dto/prepare-payment.dto';
import {
  VaultHistoryEntryDto,
  VaultTransactionDetailDto,
} from './dto/vault-history.dto';
import { ConfirmCashDebtDto, SettlementPreviewDto } from './dto/settlement.dto';
import { UpdateVaultSpendDto } from './dto/update-vault-spend.dto';

@ApiTags('trip-vault')
@ApiBearerAuth()
@UseGuards(Web3EnabledGuard, Web3TripGuard)
@ApiParam({ name: 'tripId', type: 'integer' })
@Controller('trips/:tripId/vault')
export class TripVaultController {
  constructor(
    private readonly vaultService: TripVaultService,
    private readonly payService: TripVaultPayService,
    private readonly historyService: TripVaultHistoryService,
    private readonly settlementService: TripVaultSettlementService,
  ) {}

  // Linking is what makes a member syncable on chain, so the sync happens here.
  // Nothing else covers this member: syncMembers at vault creation runs before
  // anyone has a wallet, and joinTrip only fires for people who arrive by
  // invite, never the trip's creator. Without this the creator is missing from
  // the vault and cannot approve a spend or a settlement.
  //
  // Best effort: a chain hiccup must not stop the wallet being recorded, and
  // syncMembers is idempotent, so any later sync picks them up.
  @Post('wallet')
  @ApiOperation({
    summary: 'Link the caller embedded wallet public key',
    operationId: 'linkVaultWallet',
  })
  async linkWallet(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: LinkWalletDto,
    @CurrentUser('sub') userId: number,
  ): Promise<LinkWalletResponseDto> {
    await this.vaultService.assertMember(tripId, userId);
    const wallet = await this.vaultService.linkWallet(userId, dto.publicKey);
    try {
      await this.vaultService.syncMembers(tripId);
      // Their Member account exists only now, so any role the trip already
      // decided on has had nowhere to go until this point.
      await this.vaultService.syncRoles(tripId);
    } catch {
      // Logged by syncMembers; the wallet itself is saved either way.
    }
    return { publicKey: wallet.publicKey };
  }

  @Post()
  @ApiOperation({
    summary: 'Create the group wallet for a trip',
    operationId: 'createVault',
  })
  async createVault(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: CreateVaultDto,
    @CurrentUser('sub') userId: number,
  ): Promise<VaultCreatedDto> {
    // Choosing custom spend limits is a trip-configuration decision, so only
    // the host may do it explicitly. A member (whose first deposit or payment
    // may be the one that needs the vault) gets the fixed defaults instead, via
    // ensureDefaultVault — their requested limits are ignored, never applied.
    const isHost = await this.vaultService
      .assertHost(tripId, userId)
      .then(() => true)
      .catch((error: unknown) => {
        if (error instanceof ForbiddenException) return false;
        throw error;
      });
    if (!isHost) {
      const vault = await this.vaultService.ensureDefaultVault(tripId, userId);
      return {
        vaultPda: vault.vaultPda,
        usdcAta: vault.usdcAta,
        membersSynced: 0,
      };
    }
    const vault = await this.vaultService.createVault(
      tripId,
      userId,
      dto.thresholdMicro ? BigInt(dto.thresholdMicro) : DEFAULT_THRESHOLD_MICRO,
      dto.dailyLimitMicro
        ? BigInt(dto.dailyLimitMicro)
        : DEFAULT_DAILY_LIMIT_MICRO,
    );
    // Members are synced here rather than left to a separate call: a vault
    // nobody can approve against is not usable, and forgetting the second step
    // would only surface at settlement.
    const membersSynced = await this.vaultService.syncMembers(tripId);
    return {
      vaultPda: vault.vaultPda,
      usdcAta: vault.usdcAta,
      membersSynced,
    };
  }

  @Get('wallet')
  @ApiOperation({
    summary: 'The caller own wallet address and USDC balance',
    operationId: 'getMyWallet',
  })
  async getMyWallet(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('sub') userId: number,
  ): Promise<WalletBalanceDto> {
    const wallet = await this.vaultService.walletBalance(userId);
    return {
      publicKey: wallet.publicKey,
      usdcAta: wallet.usdcAta,
      balanceMicro: wallet.balanceMicro.toString(),
      skrDomain: wallet.skrDomain,
      isSeeker: wallet.isSeeker,
    };
  }

  @Get('identities')
  @ApiOperation({
    summary: 'Seeker badge and .skr name per member',
    operationId: 'getVaultMemberIdentities',
  })
  @ApiOkResponse({ type: MemberIdentityDto, isArray: true })
  async identities(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('sub') userId: number,
  ): Promise<MemberIdentityDto[]> {
    await this.vaultService.assertMember(tripId, userId);
    return this.vaultService.identitiesForTrip(tripId);
  }

  @Get('balance')
  @ApiOperation({
    summary: 'On-chain balance and limits for the trip vault',
    operationId: 'getVaultBalance',
  })
  async getBalance(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('sub') userId: number,
  ): Promise<VaultBalanceDto> {
    await this.vaultService.assertMember(tripId, userId);
    const vault = await this.vaultService.requireVault(tripId);
    const accounts = await this.vaultService.getBalance(tripId);
    return {
      vaultPda: accounts.vaultPda,
      usdcAta: accounts.usdcAta,
      treasuryAta: accounts.treasuryAta,
      spendRecipientAta: accounts.spendRecipientAta ?? undefined,
      balanceMicro: accounts.balanceMicro.toString(),
      thresholdMicro: vault.thresholdMicro.toString(),
      dailyLimitMicro: vault.dailyLimitMicro.toString(),
    };
  }

  @Post('members/sync')
  @ApiOperation({
    summary: 'Add accepted trip members to the vault on chain',
    operationId: 'syncVaultMembers',
  })
  async syncMembers(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('sub') userId: number,
  ): Promise<SyncMembersResultDto> {
    // Self-sync already happens on wallet link (linkWallet above); this manual
    // re-sync is a host/admin action.
    await this.vaultService.assertHost(tripId, userId);
    return { added: await this.vaultService.syncMembers(tripId) };
  }

  @Post('deposit')
  @ApiOperation({
    summary: 'Build a deposit transaction for the caller to sign',
    operationId: 'buildVaultDeposit',
  })
  async deposit(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: DepositRequestDto,
    @CurrentUser('sub') userId: number,
  ): Promise<UnsignedTxDto> {
    await this.vaultService.assertMember(tripId, userId);
    const base64Tx = await this.vaultService.buildDepositTx(
      tripId,
      userId,
      BigInt(dto.amountMicro),
    );
    return { base64Tx };
  }

  @Post('deposit/submit')
  @ApiOperation({
    summary: 'Submit the signed deposit transaction',
    operationId: 'submitVaultDeposit',
  })
  async submitDeposit(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: SubmitDepositDto,
    @CurrentUser('sub') userId: number,
  ): Promise<DepositResultDto> {
    await this.vaultService.assertMember(tripId, userId);
    // dto.amountMicro is deliberately not passed on: the credited amount is
    // decoded from the signed transaction itself (audit S1).
    return {
      signature: await this.vaultService.submitDeposit(
        tripId,
        userId,
        dto.signedTx,
      ),
    };
  }

  @Get('history')
  @ApiOperation({
    summary: 'Deposits and payments for the trip vault, newest first',
    operationId: 'getVaultHistory',
  })
  async getHistory(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('sub') userId: number,
  ): Promise<VaultHistoryEntryDto[]> {
    await this.vaultService.assertMember(tripId, userId);
    return this.historyService.getHistory(tripId);
  }

  @ApiParam({ name: 'vaultTransactionId', type: 'integer' })
  @Get('pay/:vaultTransactionId')
  @ApiOperation({
    summary: 'Full receipt for one vault payment',
    operationId: 'getVaultTransaction',
  })
  async getTransaction(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('vaultTransactionId', ParseIntPipe) vaultTransactionId: number,
    @CurrentUser('sub') userId: number,
  ): Promise<VaultTransactionDetailDto> {
    await this.vaultService.assertMember(tripId, userId);
    return this.historyService.getTransactionDetail(
      tripId,
      vaultTransactionId,
      userId,
    );
  }

  @ApiParam({ name: 'vaultTransactionId', type: 'integer' })
  @Patch('pay/:vaultTransactionId')
  @ApiOperation({
    summary: 'Edit share, name, and category on a confirmed vault spend',
    operationId: 'updateVaultSpend',
  })
  async updateSpend(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('vaultTransactionId', ParseIntPipe) vaultTransactionId: number,
    @CurrentUser('sub') userId: number,
    @Body() dto: UpdateVaultSpendDto,
  ): Promise<VaultTransactionDetailDto> {
    await this.vaultService.assertMember(tripId, userId);
    await this.payService.updateSpendMetadata(
      tripId,
      vaultTransactionId,
      userId,
      dto,
    );
    return this.historyService.getTransactionDetail(
      tripId,
      vaultTransactionId,
      userId,
    );
  }

  @Post('pay/recipient')
  @ApiOperation({
    summary: 'Who a scanned code pays, before any amount is known',
    operationId: 'lookupVaultRecipient',
  })
  async lookupRecipient(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: LookupRecipientDto,
    @CurrentUser('sub') userId: number,
  ): Promise<RecipientDto> {
    await this.vaultService.assertMember(tripId, userId);
    const found = await this.payService.lookupRecipient(dto.qrPayload);
    return {
      recipientName: found.recipientName,
      bankBin: found.bankBin,
      accountNumber: found.accountNumber,
      amountVnd: found.amountVnd?.toString() ?? null,
      description: found.description,
    };
  }

  @Post('pay/quote')
  @ApiOperation({
    summary: 'Price a VietQR payment against the vault',
    operationId: 'quoteVaultPayment',
  })
  async quote(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: PayQuoteRequestDto,
    @CurrentUser('sub') userId: number,
  ): Promise<PayQuoteDto> {
    await this.vaultService.assertMember(tripId, userId);
    const quote = await this.payService.quote(
      tripId,
      userId,
      dto.qrPayload,
      dto.amountVnd ? BigInt(dto.amountVnd) : undefined,
      dto.source ?? VaultTxSource.VAULT,
    );
    return {
      recipientName: quote.recipientName,
      bankBin: quote.bankBin,
      accountNumber: quote.accountNumber,
      amountVnd: quote.amountVnd.toString(),
      amountUsdcMicro: quote.amountUsdcMicro.toString(),
      feeMicro: quote.feeMicro.toString(),
      rate: quote.rate,
      needsApproval: quote.needsApproval,
      source: quote.source,
    };
  }

  @Post('pay/prepare')
  @ApiOperation({
    summary: 'Record the payment and return a transaction to sign',
    operationId: 'prepareVaultPayment',
  })
  async preparePayment(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: PreparePaymentDto,
    @CurrentUser('sub') userId: number,
  ): Promise<PreparePaymentResponseDto> {
    await this.vaultService.assertMember(tripId, userId);
    return this.payService.preparePayment(tripId, userId, {
      qrPayload: dto.qrPayload,
      amountVnd: dto.amountVnd ? BigInt(dto.amountVnd) : undefined,
      name: dto.name,
      category: dto.category,
      shareWithUserIds: dto.shareWithUserIds,
      source: dto.source ?? VaultTxSource.VAULT,
    });
  }

  @ApiParam({ name: 'vaultTransactionId', type: 'integer' })
  @Post('pay/:vaultTransactionId/submit')
  @ApiOperation({
    summary: 'Submit the signed payment transaction',
    operationId: 'submitVaultPayment',
  })
  async submitPayment(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('vaultTransactionId', ParseIntPipe) vaultTransactionId: number,
    @Body() dto: SubmitSignedDto,
    @CurrentUser('sub') userId: number,
  ): Promise<SubmitResultDto> {
    await this.vaultService.assertMember(tripId, userId);
    const record = await this.payService.submitPayment(
      vaultTransactionId,
      dto.signedTx,
      tripId,
      userId,
    );
    return { status: record.status };
  }

  @ApiParam({ name: 'vaultTransactionId', type: 'integer' })
  @Post('pay/:vaultTransactionId/approve')
  @ApiOperation({
    summary: 'Build the second approval transaction',
    operationId: 'approveVaultPayment',
  })
  async approvePayment(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('vaultTransactionId', ParseIntPipe) vaultTransactionId: number,
    @CurrentUser('sub') userId: number,
  ): Promise<UnsignedTxDto> {
    await this.vaultService.assertMember(tripId, userId);
    return {
      base64Tx: await this.payService.buildApprovalTx(
        vaultTransactionId,
        userId,
        tripId,
      ),
    };
  }

  @ApiParam({ name: 'vaultTransactionId', type: 'integer' })
  @Post('pay/:vaultTransactionId/cancel')
  @ApiOperation({
    summary: 'Build a cancel transaction for an open spend proposal',
    operationId: 'cancelVaultPayment',
  })
  async cancelPayment(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('vaultTransactionId', ParseIntPipe) vaultTransactionId: number,
    @CurrentUser('sub') userId: number,
  ): Promise<UnsignedTxDto> {
    await this.vaultService.assertMember(tripId, userId);
    return {
      base64Tx: await this.payService.buildCancelTx(
        vaultTransactionId,
        userId,
        tripId,
      ),
    };
  }

  @ApiParam({ name: 'vaultTransactionId', type: 'integer' })
  @Post('pay/:vaultTransactionId/cancel/submit')
  @ApiOperation({
    summary: 'Submit the signed cancel transaction',
    operationId: 'submitVaultPaymentCancel',
  })
  async submitCancelPayment(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('vaultTransactionId', ParseIntPipe) vaultTransactionId: number,
    @Body() dto: SubmitSignedDto,
    @CurrentUser('sub') userId: number,
  ): Promise<{ status: string }> {
    await this.vaultService.assertMember(tripId, userId);
    const record = await this.payService.submitCancel(
      vaultTransactionId,
      dto.signedTx,
      tripId,
      userId,
    );
    return { status: record.status };
  }

  @ApiParam({ name: 'vaultTransactionId', type: 'integer' })
  @Post('pay/:vaultTransactionId/abandon')
  @ApiOperation({
    summary: 'Retire a payment the client could not sign',
    operationId: 'abandonVaultPayment',
  })
  async abandonPayment(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('vaultTransactionId', ParseIntPipe) vaultTransactionId: number,
    @CurrentUser('sub') userId: number,
  ): Promise<SubmitResultDto> {
    await this.vaultService.assertMember(tripId, userId);
    const record = await this.payService.abandonPayment(
      vaultTransactionId,
      tripId,
      userId,
    );
    return { status: record.status };
  }

  @Get('settlement')
  @ApiOperation({
    summary: 'Who is owed what if the trip vault were wound up now',
    operationId: 'getVaultSettlement',
  })
  async getSettlement(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('sub') userId: number,
  ): Promise<SettlementPreviewDto> {
    await this.vaultService.assertMember(tripId, userId);
    return this.settlementService.preview(tripId, userId);
  }

  @Post('settlement/cash/confirm')
  @ApiOperation({
    summary: 'Confirm a cash debt was received. Creditor only.',
    operationId: 'confirmVaultCashDebt',
  })
  async confirmCashDebt(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: ConfirmCashDebtDto,
    @CurrentUser('sub') userId: number,
  ): Promise<void> {
    await this.vaultService.assertMember(tripId, userId);
    await this.settlementService.confirmCashDebt(
      tripId,
      dto.fromUserId,
      userId,
    );
  }
}
