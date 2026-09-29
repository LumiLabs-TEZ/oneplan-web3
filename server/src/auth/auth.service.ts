import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuthProvider, InviteStatus, Prisma, TripStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppleAuthService, SocialTokenPayload } from './apple-auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LinkAccountDto } from './dto/link-account.dto';
import { LinkEmailDto } from './dto/link-email.dto';
import {
  PassportCountryStatDto,
  PassportSummaryDto,
} from './dto/passport-summary.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { SocialLoginDto, SocialProvider } from './dto/social-login.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GoogleAuthService } from './google-auth.service';
import { JwtTokenService } from './jwt.service';
import { StorageService } from '../storage/storage.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ANALYTICS_EVENTS } from '../analytics/constants/events';
import { ScanCreditService } from '../scan-credit/scan-credit.service';
import { DeletedUsersService } from '../deleted-users/deleted-users.service';
import { isEntitledToPro } from '../common/subscription-status.util';
import { VaultSafetyService } from '../solana/vault-safety.service';

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly appleAuthService: AppleAuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly analytics: AnalyticsService,
    private readonly scanCredit: ScanCreditService,
    private readonly deletedUsers: DeletedUsersService,
    private readonly vaultSafety: VaultSafetyService,
  ) {}

  private isAdminEmail(email: string): boolean {
    const adminEmails = this.configService.get<string[]>('admin.emails') ?? [];
    return adminEmails.includes(email.toLowerCase());
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const email = dto.email.toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            displayName: dto.displayName,
            friendCode: randomBytes(32).toString('hex'),
          },
        });

        await tx.authAccount.create({
          data: {
            userId: newUser.id,
            provider: AuthProvider.EMAIL,
            providerUserId: email,
            passwordHash,
          },
        });

        await this.scanCredit.grantSignupBonus(tx, newUser.id);

        return newUser;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }

    void this.analytics.track(ANALYTICS_EVENTS.SIGNUP_COMPLETED, {
      userId: user.id,
      properties: { provider: 'email' },
    });
    // Signup-bonus credits: emitted here (post user-creation tx) — not inside
    // grantSignupBonus, whose analyticsEvent.userId FK would reference the
    // not-yet-committed user. Guarded like grantSignupBonus's own no-op.
    if (this.scanCredit.signupGrantAmount > 0) {
      void this.analytics.track(ANALYTICS_EVENTS.SCAN_CREDITS_GRANTED, {
        userId: user.id,
        properties: {
          source: 'signup_bonus',
          amount: this.scanCredit.signupGrantAmount,
        },
      });
    }
    void this.analytics.track(ANALYTICS_EVENTS.LOGIN_METHOD_SELECTED, {
      userId: user.id,
      properties: { provider: 'email' },
    });

    return this.generateAuthResponse(user.id, user.email, user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.verifyEmailPassword(dto.email, dto.password);
    void this.analytics.track(ANALYTICS_EVENTS.LOGIN_METHOD_SELECTED, {
      userId: user.id,
      properties: { provider: 'email' },
    });
    return this.generateAuthResponse(user.id, user.email, user);
  }

  async adminLogin(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.verifyEmailPassword(dto.email, dto.password);
    if (!this.isAdminEmail(user.email)) {
      // Same message as a wrong password to avoid enumerating admin emails.
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.generateAuthResponse(user.id, user.email, user);
  }

  private async verifyEmailPassword(
    rawEmail: string,
    password: string,
  ): Promise<{
    id: number;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  }> {
    const email = rawEmail.toLowerCase();

    const authAccount = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.EMAIL,
          providerUserId: email,
        },
      },
      include: { user: true },
    });

    if (!authAccount || !authAccount.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      password,
      authAccount.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return authAccount.user;
  }

  async socialLogin(dto: SocialLoginDto): Promise<AuthResponseDto> {
    const tokenPayload = await this.verifySocialToken(
      dto.provider,
      dto.identityToken,
      dto.nonce,
    );

    const provider =
      dto.provider === SocialProvider.APPLE
        ? AuthProvider.APPLE
        : AuthProvider.GOOGLE;

    // Check if this social account already exists
    const existingAccount = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: tokenPayload.sub,
        },
      },
      include: { user: true },
    });

    if (existingAccount) {
      void this.analytics.track(ANALYTICS_EVENTS.LOGIN_METHOD_SELECTED, {
        userId: existingAccount.user.id,
        properties: { provider: provider.toLowerCase() },
      });
      return this.generateAuthResponse(
        existingAccount.user.id,
        existingAccount.user.email,
        existingAccount.user,
      );
    }

    // Determine email for account creation: prefer token email, fall back to
    // DTO email. This is only ever used to create a BRAND-NEW user below —
    // there is no existing account to take over.
    const email = tokenPayload.email ?? dto.email ?? null;

    if (!email) {
      this.logger.warn(
        `Social login rejected (422): ${provider} token for sub ${tokenPayload.sub} carries no email and none was provided`,
      );
      throw new UnprocessableEntityException(
        'Email is required for account creation. Please ensure email sharing is enabled in your Apple/Google account settings.',
      );
    }

    // Auto-link (attaching this provider to an EXISTING user) may only be
    // matched on the IdP-verified tokenPayload.email — never dto.email, which
    // is client-supplied and unauthenticated. Looking up by dto.email would
    // let an attacker claim an arbitrary email in the request body and get
    // silently linked into that account. If the token carries no email at
    // all, skip the auto-link lookup entirely and fall through to account
    // creation, where a colliding email still surfaces as the existing
    // Conflict/"log in and link" error via the P2002 catch below. (Whether
    // that token email is *verified* is checked below, same as before — an
    // unverified token email still finds the existing user so we can reject
    // with the same Conflict message.)
    const matchEmail = tokenPayload.email
      ? tokenPayload.email.toLowerCase()
      : null;

    const existingUser = matchEmail
      ? await this.prisma.user.findUnique({
          where: { email: matchEmail },
          include: { authAccounts: { select: { provider: true } } },
        })
      : null;
    if (existingUser) {
      // Auto-link is safe only when the social provider has verified the email
      // AND the existing account has no email/password auth method.
      // Allowing auto-link for email/password accounts would let an attacker
      // who controls an OAuth identity for that email silently take over a
      // password account. Force those users to log in first and then link via
      // the authenticated POST /auth/link endpoint.
      const hasEmailProvider = existingUser.authAccounts.some(
        (a) => a.provider === AuthProvider.EMAIL,
      );

      // A user should only ever hold one AuthAccount per provider. Since the
      // provider+sub lookup above already found nothing, a second row here
      // would mean a second distinct provider identity (different sub) tied to
      // the same email — refuse rather than silently accumulate duplicates.
      const hasSameProvider = existingUser.authAccounts.some(
        (a) => a.provider === provider,
      );

      if (!tokenPayload.emailVerified || hasEmailProvider || hasSameProvider) {
        this.logger.warn(
          `Social login rejected (409): ${provider} sign-in for ${matchEmail} collides with existing user ${existingUser.id} — user must log in and link from Settings`,
        );
        throw new ConflictException(
          'An account with this email already exists. Please log in with your existing method, then link this provider from Settings.',
        );
      }

      // Safe auto-link: add the new social provider to the existing user.
      await this.prisma.authAccount.create({
        data: {
          userId: existingUser.id,
          provider,
          providerUserId: tokenPayload.sub,
        },
      });

      void this.analytics.track(ANALYTICS_EVENTS.LOGIN_METHOD_SELECTED, {
        userId: existingUser.id,
        properties: { provider: provider.toLowerCase() },
      });

      return this.generateAuthResponse(
        existingUser.id,
        existingUser.email,
        existingUser,
      );
    }

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            displayName: dto.displayName ?? email.split('@')[0],
            friendCode: randomBytes(32).toString('hex'),
          },
        });

        await tx.authAccount.create({
          data: {
            userId: newUser.id,
            provider,
            providerUserId: tokenPayload.sub,
          },
        });

        await this.scanCredit.grantSignupBonus(tx, newUser.id);

        return newUser;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.logger.warn(
          `Social login rejected (409): ${provider} signup for ${email.toLowerCase()} hit a unique-constraint race with an existing account`,
        );
        throw new ConflictException(
          'An account with this email already exists. Please log in with your existing account, then link this social provider.',
        );
      }
      throw e;
    }

    void this.analytics.track(ANALYTICS_EVENTS.SIGNUP_COMPLETED, {
      userId: user.id,
      properties: { provider: provider.toLowerCase() },
    });
    // Signup-bonus credits — see register() for why this is post-tx.
    if (this.scanCredit.signupGrantAmount > 0) {
      void this.analytics.track(ANALYTICS_EVENTS.SCAN_CREDITS_GRANTED, {
        userId: user.id,
        properties: {
          source: 'signup_bonus',
          amount: this.scanCredit.signupGrantAmount,
        },
      });
    }
    void this.analytics.track(ANALYTICS_EVENTS.LOGIN_METHOD_SELECTED, {
      userId: user.id,
      properties: { provider: provider.toLowerCase() },
    });

    return this.generateAuthResponse(user.id, user.email, user);
  }

  async refreshToken(dto: RefreshTokenDto): Promise<AuthResponseDto> {
    let payload;
    try {
      payload = this.jwtTokenService.verifyRefreshToken(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Atomic revocation: only succeeds if token is not already revoked
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { jti: payload.jti, isRevoked: false },
      data: { isRevoked: true },
    });

    if (revoked.count === 0) {
      // Token was already revoked — potential replay attack. Revoke entire family.
      await this.prisma.refreshToken.updateMany({
        where: { family: payload.family },
        data: { isRevoked: true },
      });
      this.logger.warn(
        `Refresh token reuse detected for family ${payload.family}. Revoked all tokens.`,
      );
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Fetch user for the response
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.generateAuthResponse(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user,
      storedToken.family,
    );
  }

  async linkAccount(
    userId: number,
    dto: LinkAccountDto,
  ): Promise<UserProfileDto> {
    const tokenPayload = await this.verifySocialToken(
      dto.provider,
      dto.identityToken,
      dto.nonce,
    );

    const provider =
      dto.provider === SocialProvider.APPLE
        ? AuthProvider.APPLE
        : AuthProvider.GOOGLE;

    // Check if already linked to another user
    const existingAccount = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: tokenPayload.sub,
        },
      },
    });

    if (existingAccount) {
      if (existingAccount.userId === userId) {
        throw new ConflictException('This provider is already linked');
      }
      throw new ConflictException(
        'This account is already linked to another user',
      );
    }

    await this.prisma.authAccount.create({
      data: {
        userId,
        provider,
        providerUserId: tokenPayload.sub,
      },
    });

    return this.getProfile(userId);
  }

  async linkEmailPassword(
    userId: number,
    dto: LinkEmailDto,
  ): Promise<UserProfileDto> {
    const email = dto.email.toLowerCase();

    // Check if user already has email provider
    const existingEmail = await this.prisma.authAccount.findFirst({
      where: { userId, provider: AuthProvider.EMAIL },
    });
    if (existingEmail) {
      throw new ConflictException('Email login already linked to this account');
    }

    // Check if email is already used by another account
    const emailTaken = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.EMAIL,
          providerUserId: email,
        },
      },
    });
    if (emailTaken) {
      throw new ConflictException('This email is already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    await this.prisma.authAccount.create({
      data: {
        userId,
        provider: AuthProvider.EMAIL,
        providerUserId: email,
        passwordHash,
      },
    });

    // Don't overwrite user.email — the linked email/password is
    // stored in AuthAccount.providerUserId, not on the User model.
    // Changing User.email would silently alter the user's identity.

    return this.getProfile(userId);
  }

  async unlinkAccount(
    userId: number,
    provider: AuthProvider,
  ): Promise<UserProfileDto> {
    const accountCount = await this.prisma.authAccount.count({
      where: { userId },
    });

    if (accountCount <= 1) {
      throw new BadRequestException(
        'Cannot unlink your only authentication method',
      );
    }

    await this.prisma.authAccount.deleteMany({
      where: { userId, provider },
    });

    return this.getProfile(userId);
  }

  async getProfile(userId: number): Promise<UserProfileDto> {
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { authAccounts: { select: { provider: true } } },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    // Backfill friendCode for existing users who don't have one
    if (!user.friendCode) {
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { friendCode: randomBytes(32).toString('hex') },
        include: { authAccounts: { select: { provider: true } } },
      });
    }

    const avatarUrl = await this.resolveAvatarUrl(user.avatarUrl);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl,
      createdAt: user.createdAt.toISOString(),
      friendCode: user.friendCode ?? null,
      providers: user.authAccounts.map((a) => a.provider),
      isPro: isEntitledToPro(user),
      preferredCurrency: user.preferredCurrency,
      isAdmin: this.isAdminEmail(user.email),
      locale: user.locale,
      engagementPushEnabled: user.engagementPushEnabled,
      engagementConsentGiven: user.engagementConsentedAt !== null,
    };
  }

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    const data: Prisma.UserUpdateInput = {};

    if (dto.displayName !== undefined) {
      const normalizedDisplayName = dto.displayName.trim();
      if (!normalizedDisplayName) {
        throw new BadRequestException('Display name cannot be empty');
      }
      data.displayName = normalizedDisplayName;
    }

    if (dto.preferredCurrency !== undefined) {
      data.preferredCurrency = dto.preferredCurrency;
    }

    if (dto.locale !== undefined) {
      data.locale = dto.locale;
    }

    if (dto.engagementPushEnabled !== undefined) {
      data.engagementPushEnabled = dto.engagementPushEnabled;
    }

    // Marketing-consent (App Store 4.5.4): stamp the time server-side on opt-in;
    // never accept a client-supplied timestamp. Consent is a one-way audit
    // signal — clearing the toggle uses engagementPushEnabled, not this.
    if (dto.engagementConsent === true) {
      data.engagementConsentedAt = new Date();
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data,
      });
    }

    return this.getProfile(userId);
  }

  private async resolveAvatarUrl(value: string | null): Promise<string | null> {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    try {
      const { url } = await this.storageService.getSignedThumbUrl(value);
      return url;
    } catch {
      return null;
    }
  }

  async getPassportSummary(
    userId: number,
    year?: number,
  ): Promise<PassportSummaryDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        displayName: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    const trips = await this.prisma.trip.findMany({
      where: {
        status: TripStatus.ENDED,
        members: {
          some: { userId, inviteStatus: InviteStatus.ACCEPTED },
        },
        // A trip counts for the year it ended; trips without an endDate are
        // excluded from year-filtered results but still count for all-time.
        ...(year !== undefined && {
          endDate: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
        }),
      },
      select: {
        city: { select: { id: true, name: true } },
        country: { select: { id: true, name: true, emoji: true } },
      },
    });

    const cityStatsById = new Map<number, { name: string; count: number }>();
    const countryStatsById = new Map<number, PassportCountryStatDto>();

    for (const trip of trips) {
      if (trip.city) {
        const existing = cityStatsById.get(trip.city.id);
        cityStatsById.set(trip.city.id, {
          name: trip.city.name,
          count: (existing?.count ?? 0) + 1,
        });
      }

      if (trip.country) {
        const existing = countryStatsById.get(trip.country.id);
        countryStatsById.set(trip.country.id, {
          name: trip.country.name,
          emoji: trip.country.emoji,
          count: (existing?.count ?? 0) + 1,
        });
      }
    }

    const topCities = Array.from(cityStatsById.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    const topCountries = Array.from(countryStatsById.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    return {
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      memberSince: user.createdAt.toISOString(),
      tripsCount: trips.length,
      countriesCount: countryStatsById.size,
      citiesCount: cityStatsById.size,
      topCities,
      topCountries,
    };
  }

  async logout(userId: number, dto: RefreshTokenDto): Promise<void> {
    let payload;
    try {
      payload = this.jwtTokenService.verifyRefreshToken(dto.refreshToken);
    } catch {
      // Silently ignore invalid tokens on logout
      return;
    }

    // Only allow revoking your own token family
    if (payload.sub !== userId) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { family: payload.family, userId },
      data: { isRevoked: true },
    });
  }

  async deleteAccount(userId: number): Promise<void> {
    // Before anything is archived or deleted: owned trips cascade their vaults
    // and deposits made into other people's vaults would lose their owner.
    await this.vaultSafety.assertAccountDeletable(userId);

    const { photoUrls, listingCovers } = await this.prisma.$transaction(
      async (tx) => {
        // 0. Snapshot everything about this user into the retention archive
        // BEFORE anything is deleted. Purged automatically after 30 days.
        await this.deletedUsers.archiveUser(tx, userId);

        // 1. Get trips owned by this user (will be deleted entirely)
        const ownedTrips = await tx.trip.findMany({
          where: { createdById: userId },
          select: { id: true },
        });
        const ownedTripIds = ownedTrips.map((t) => t.id);

        // 2. Get photos uploaded by this user (for S3 cleanup)
        const userPhotos = await tx.tripPhoto.findMany({
          where: { uploadedById: userId },
          select: { photoUrl: true },
        });

        // 3. Get marketplace listings owned by user
        const userListings = await tx.marketplaceListing.findMany({
          where: { createdById: userId },
          select: { coverImageUrl: true },
        });

        // 4. Nullify FKs for entities in trips user doesn't own
        // (Entities in owned trips will be cascade deleted)
        await tx.expense.updateMany({
          where: { paidById: userId, tripId: { notIn: ownedTripIds } },
          data: { paidById: null },
        });

        await tx.chatMessage.updateMany({
          where: { senderId: userId, tripId: { notIn: ownedTripIds } },
          data: { senderId: null },
        });

        await tx.tripActivity.updateMany({
          where: { userId: userId, tripId: { notIn: ownedTripIds } },
          data: { userId: null },
        });

        // 5. Delete entities with NoAction constraints. Every NoAction FK to
        // User must be listed here or `tx.user.delete()` below fails with a
        // foreign-key violation and the account can never be deleted. Current
        // NoAction relations: TripPhoto, MarketplaceListing, Trip, TripNote.
        await tx.tripPhoto.deleteMany({ where: { uploadedById: userId } });
        await tx.marketplaceListing.deleteMany({
          where: { createdById: userId },
        });
        // Notes the user wrote in OTHER people's trips are not covered by the
        // owned-trip cascade below, so they must be removed explicitly.
        await tx.tripNote.deleteMany({ where: { createdById: userId } });
        await tx.trip.deleteMany({ where: { createdById: userId } });

        // 6. Delete user (cascade handles AuthAccount, RefreshToken, etc.)
        await tx.user.delete({ where: { id: userId } });

        return {
          photoUrls: userPhotos.map((p) => p.photoUrl),
          listingCovers: userListings
            .map((l) => l.coverImageUrl)
            .filter((url): url is string => url !== null),
        };
      },
    );

    // 7. S3 cleanup (fire-and-forget, log failures)
    this.cleanupS3Files([...photoUrls, ...listingCovers]);
  }

  private async cleanupS3Files(urls: string[]): Promise<void> {
    for (const url of urls) {
      try {
        await this.storageService.deleteObject(url);
      } catch (error) {
        this.logger.warn(`Failed to delete S3 file: ${url}`, error);
      }
    }
  }

  private async verifySocialToken(
    provider: SocialProvider,
    identityToken: string,
    nonce?: string,
  ): Promise<SocialTokenPayload> {
    if (provider === SocialProvider.APPLE) {
      return await this.verifyOrReject(provider, () =>
        this.appleAuthService.verifyIdentityToken(identityToken, nonce),
      );
    }
    return this.verifyOrReject(provider, () =>
      this.googleAuthService.verifyIdentityToken(identityToken),
    );
  }

  // jose/google-auth verification failures (wrong aud, expired token, bad
  // signature, ...) would otherwise bubble up as unlogged 500s. Log the real
  // reason and return a 401 the client can handle.
  private async verifyOrReject(
    provider: SocialProvider,
    verify: () => Promise<SocialTokenPayload>,
  ): Promise<SocialTokenPayload> {
    try {
      return await verify();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.logger.warn(
        `Social login rejected (401): ${provider} token verification failed — ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new UnauthorizedException(`Invalid ${provider} identity token`);
    }
  }

  private async generateAuthResponse(
    userId: number,
    email: string,
    user: {
      id: number;
      email: string;
      displayName: string;
      avatarUrl: string | null;
    },
    family?: string,
  ): Promise<AuthResponseDto> {
    const accessToken = this.jwtTokenService.generateAccessToken(userId, email);
    const refreshResult = await this.jwtTokenService.generateRefreshToken(
      userId,
      family,
    );

    return {
      accessToken,
      refreshToken: refreshResult.token,
      expiresIn: this.jwtTokenService.getAccessExpiresInSeconds(),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    };
  }
}
