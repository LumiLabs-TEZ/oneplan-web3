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
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { WalletProvider } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Web3EnabledGuard } from '../solana/web3-enabled.guard';
import { SeekerIdentityService } from '../web3/seeker-identity.service';
import { Web3EligibleGuard } from '../web3/web3-eligible.guard';
import { LinkWalletDto, LinkWalletResponseDto } from './dto/link-wallet.dto';
import { SubmitSignedDto } from './dto/prepare-payment.dto';
import { LinkWalletSiwsDto, SiwsChallengeDto } from './dto/siws.dto';
import { WalletHistoryEntryDto } from './dto/wallet-history.dto';
import {
  BuildWithdrawalDto,
  InspectRecipientDto,
  RecipientCheckDto,
  WithdrawalResultDto,
  WithdrawalTxDto,
} from './dto/wallet-withdraw.dto';
import { WalletBalanceDto } from './dto/wallet-balance.dto';
import { SiwsService } from './siws.service';
import { TripVaultService } from './trip-vault.service';
import { WalletWithdrawService } from './wallet-withdraw.service';

/**
 * The member's own wallet, outside any trip.
 *
 * The vault routes are nested under a trip because they act on that trip's
 * money. A personal wallet is not a trip's, and reaching it through one made
 * settings ask which trip it belonged to.
 */
@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(Web3EnabledGuard, Web3EligibleGuard)
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly vaultService: TripVaultService,
    private readonly withdrawals: WalletWithdrawService,
    private readonly siws: SiwsService,
    private readonly identity: SeekerIdentityService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'The caller wallet and its USDC balance',
    operationId: 'getWallet',
  })
  @ApiOkResponse({ type: WalletBalanceDto })
  async getWallet(
    @CurrentUser('sub') userId: number,
  ): Promise<WalletBalanceDto> {
    const wallet = await this.vaultService.walletBalance(userId);
    return {
      publicKey: wallet.publicKey ?? '',
      usdcAta: wallet.usdcAta,
      balanceMicro: wallet.balanceMicro.toString(),
      skrDomain: wallet.skrDomain,
      isSeeker: wallet.isSeeker,
    };
  }

  /// Registers the embedded Solana pubkey on the user — no trip required.
  ///
  /// Trip vault still has `POST .../vault/wallet` so linking there can also
  /// sync on-chain members; personal wallet / post-login bootstrap uses this.
  @Post('link')
  @ApiOperation({
    summary: 'Link the caller embedded wallet public key',
    operationId: 'linkWallet',
  })
  @ApiCreatedResponse({ type: LinkWalletResponseDto })
  async linkWallet(
    @CurrentUser('sub') userId: number,
    @Body() dto: LinkWalletDto,
  ): Promise<LinkWalletResponseDto> {
    const wallet = await this.vaultService.linkWallet(userId, dto.publicKey);
    return { publicKey: wallet.publicKey };
  }

  @Post('siws/challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sign-In-With-Solana input for linking a wallet the user brings (MWA)',
    operationId: 'createSiwsChallenge',
  })
  @ApiOkResponse({ type: SiwsChallengeDto })
  async createSiwsChallenge(
    @CurrentUser('sub') userId: number,
  ): Promise<SiwsChallengeDto> {
    return this.siws.createChallenge(userId);
  }

  @Post('link/siws')
  @ApiOperation({
    summary: 'Link a wallet after verifying its Sign-In-With-Solana signature',
    operationId: 'linkWalletSiws',
  })
  @ApiCreatedResponse({ type: LinkWalletResponseDto })
  async linkWalletSiws(
    @CurrentUser('sub') userId: number,
    @Body() dto: LinkWalletSiwsDto,
  ): Promise<LinkWalletResponseDto> {
    const address = await this.siws.verify(userId, dto);
    const wallet = await this.vaultService.linkWallet(
      userId,
      address,
      WalletProvider.MWA,
    );
    // Fresh SIWS proof: look the key's Seeker identity up now, off the request path.
    this.identity.refreshInBackground(userId);
    return { publicKey: wallet.publicKey };
  }

  @Get('history')
  @ApiOperation({
    summary: 'Recent USDC deposits and withdrawals on the personal wallet',
    operationId: 'getWalletHistory',
  })
  @ApiOkResponse({ type: WalletHistoryEntryDto, isArray: true })
  async getHistory(
    @CurrentUser('sub') userId: number,
  ): Promise<WalletHistoryEntryDto[]> {
    return this.withdrawals.getHistory(userId);
  }

  @Post('withdraw/recipient')
  // A POST that creates nothing. Without this Nest answers 201 while the spec
  // promises 200, and the generated client throws on a reply that was correct.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check an address before an amount is chosen',
    operationId: 'inspectWithdrawRecipient',
  })
  @ApiOkResponse({ type: RecipientCheckDto })
  async inspectRecipient(
    @Body() dto: InspectRecipientDto,
  ): Promise<RecipientCheckDto> {
    return this.withdrawals.inspectRecipient(dto.address);
  }

  @Post('withdraw')
  @ApiOperation({
    summary: 'Build the transfer for the member to sign',
    operationId: 'buildWithdrawal',
  })
  async buildWithdrawal(
    @CurrentUser('sub') userId: number,
    @Body() dto: BuildWithdrawalDto,
  ): Promise<WithdrawalTxDto> {
    return this.withdrawals.buildWithdrawal(
      userId,
      dto.address,
      BigInt(dto.amountMicro),
    );
  }

  @Post('withdraw/submit')
  @ApiOperation({
    summary: 'Send the signed transfer',
    operationId: 'submitWithdrawal',
  })
  async submitWithdrawal(
    @Body() dto: SubmitSignedDto,
  ): Promise<WithdrawalResultDto> {
    return this.withdrawals.submitWithdrawal(dto.signedTx);
  }
}
