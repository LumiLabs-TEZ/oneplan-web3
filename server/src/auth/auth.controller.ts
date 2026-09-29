import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthProvider } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Web3EnabledGuard } from '../solana/web3-enabled.guard';
import { Web3EligibleGuard } from '../web3/web3-eligible.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LinkAccountDto } from './dto/link-account.dto';
import { LinkEmailDto } from './dto/link-email.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { PassportSummaryDto } from './dto/passport-summary.dto';
import { PassportSummaryQueryDto } from './dto/passport-summary-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { WalletTokenDto } from './dto/wallet-token.dto';
import { WalletTokenService } from './wallet-token.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly walletTokens: WalletTokenService,
  ) {}

  // The public half of the wallet signing key. Privy fetches this to verify
  // the tokens issued below, so it must stay reachable without auth.
  @Public()
  @Get('.well-known/jwks.json')
  @ApiOperation({
    summary: 'Public keys for verifying wallet tokens',
    operationId: 'getJwks',
  })
  getJwks(): { keys: object[] } {
    return this.walletTokens.jwks();
  }

  // 404 unless WEB3_ENABLED: prod stays dark whatever WALLET_JWT_* holds.
  @Get('wallet-token')
  @UseGuards(Web3EnabledGuard, Web3EligibleGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Short-lived token the app exchanges for a wallet session',
    operationId: 'getWalletToken',
  })
  getWalletToken(@CurrentUser('sub') userId: number): WalletTokenDto {
    return { token: this.walletTokens.issue(userId) };
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    operationId: 'register',
    summary: 'Register with email and password',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email already registered' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    operationId: 'login',
    summary: 'Login with email and password',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    operationId: 'adminLogin',
    summary: 'Admin login (email/password). Rejects non-admin accounts.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  adminLogin(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.adminLogin(dto);
  }

  @Public()
  @Post('social')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    operationId: 'socialLogin',
    summary: 'Login or register with Apple/Google',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  socialLogin(@Body() dto: SocialLoginDto): Promise<AuthResponseDto> {
    return this.authService.socialLogin(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    operationId: 'refreshToken',
    summary: 'Refresh access token',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  refreshToken(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refreshToken(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'getProfile',
    summary: 'Get current user profile',
  })
  @ApiOkResponse({ type: UserProfileDto })
  getProfile(@CurrentUser('sub') userId: number): Promise<UserProfileDto> {
    return this.authService.getProfile(userId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'updateProfile',
    summary: 'Update current user profile',
  })
  @ApiOkResponse({ type: UserProfileDto })
  updateProfile(
    @CurrentUser('sub') userId: number,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    return this.authService.updateProfile(userId, dto);
  }

  @Get('passport')
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'getPassportSummary',
    summary: 'Get current user passport summary',
  })
  @ApiOkResponse({ type: PassportSummaryDto })
  getPassportSummary(
    @CurrentUser('sub') userId: number,
    @Query() query: PassportSummaryQueryDto,
  ): Promise<PassportSummaryDto> {
    return this.authService.getPassportSummary(userId, query.year);
  }

  @Post('link')
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'linkAccount',
    summary: 'Link a social provider',
  })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiConflictResponse({
    description: 'Provider already linked or claimed by another user',
  })
  linkAccount(
    @CurrentUser('sub') userId: number,
    @Body() dto: LinkAccountDto,
  ): Promise<UserProfileDto> {
    return this.authService.linkAccount(userId, dto);
  }

  @Post('link/email')
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'linkEmailPassword',
    summary: 'Add email/password login',
  })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiConflictResponse({ description: 'Email already linked or in use' })
  linkEmailPassword(
    @CurrentUser('sub') userId: number,
    @Body() dto: LinkEmailDto,
  ): Promise<UserProfileDto> {
    return this.authService.linkEmailPassword(userId, dto);
  }

  @Delete('link/:provider')
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'unlinkAccount',
    summary: 'Unlink an auth provider',
  })
  @ApiParam({ name: 'provider', enum: AuthProvider })
  @ApiOkResponse({ type: UserProfileDto })
  unlinkAccount(
    @CurrentUser('sub') userId: number,
    @Param('provider', new ParseEnumPipe(AuthProvider)) provider: AuthProvider,
  ): Promise<UserProfileDto> {
    return this.authService.unlinkAccount(userId, provider);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'logout',
    summary: 'Logout and revoke refresh token',
  })
  @ApiNoContentResponse()
  logout(
    @CurrentUser('sub') userId: number,
    @Body() dto: RefreshTokenDto,
  ): Promise<void> {
    return this.authService.logout(userId, dto);
  }

  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'deleteAccount',
    summary: 'Permanently delete user account and all associated data',
  })
  @ApiNoContentResponse({ description: 'Account deleted successfully' })
  deleteAccount(@CurrentUser('sub') userId: number): Promise<void> {
    return this.authService.deleteAccount(userId);
  }
}
