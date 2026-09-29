// Prevent jose (ESM-only) from loading — use factory mocks so the real modules are never resolved
jest.mock('./apple-auth.service', () => ({
  AppleAuthService: jest
    .fn()
    .mockImplementation(() => ({ verifyIdentityToken: jest.fn() })),
}));
jest.mock('./google-auth.service', () => ({
  GoogleAuthService: jest
    .fn()
    .mockImplementation(() => ({ verifyIdentityToken: jest.fn() })),
}));

import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsEventName, AuthProvider } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ScanCreditService } from '../scan-credit/scan-credit.service';
import { AppleAuthService } from './apple-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { JwtTokenService } from './jwt.service';
import { StorageService } from '../storage/storage.service';
import { AuthService } from './auth.service';
import { SocialProvider } from './dto/social-login.dto';

const VERIFIED_GOOGLE_PAYLOAD = {
  sub: 'google-sub-new',
  email: 'alice@example.com',
  emailVerified: true,
};

const UNVERIFIED_GOOGLE_PAYLOAD = {
  sub: 'google-sub-new',
  email: 'alice@example.com',
  emailVerified: false,
};

const BASE_USER = {
  id: 42,
  email: 'alice@example.com',
  displayName: 'Alice',
  avatarUrl: null as string | null,
  subscriptionStatus: null,
  subscriptionProductId: null,
  preferredCurrency: null,
  friendCode: 'abc123',
  createdAt: new Date(),
};

function makeSocialLoginDto(
  provider: SocialProvider,
  email = 'alice@example.com',
) {
  return {
    provider,
    identityToken: 'test-token',
    email,
    nonce: undefined,
    displayName: undefined,
  };
}

describe('AuthService.socialLogin', () => {
  let service: AuthService;
  let prisma: Record<string, jest.Mock> & {
    authAccount: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let googleAuth: { verifyIdentityToken: jest.Mock };
  let analytics: { track: jest.Mock };

  beforeEach(async () => {
    prisma = {
      authAccount: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    googleAuth = { verifyIdentityToken: jest.fn() };
    analytics = { track: jest.fn().mockResolvedValue(undefined) };

    const jwtTokenService = {
      generateAccessToken: jest.fn().mockReturnValue('access-token'),
      generateRefreshToken: jest
        .fn()
        .mockResolvedValue({ token: 'refresh-token' }),
      getAccessExpiresInSeconds: jest.fn().mockReturnValue(900),
    };

    const scanCredit = {
      signupGrantAmount: 2,
      grantSignupBonus: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtTokenService, useValue: jwtTokenService },
        {
          provide: AppleAuthService,
          useValue: { verifyIdentityToken: jest.fn() },
        },
        { provide: GoogleAuthService, useValue: googleAuth },
        {
          provide: StorageService,
          useValue: {
            getSignedThumbUrl: jest.fn().mockResolvedValue({ url: null }),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue([]) },
        },
        { provide: AnalyticsService, useValue: analytics },
        { provide: ScanCreditService, useValue: scanCredit },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // (e) Fast-path: existing (provider, sub) AuthAccount → login immediately
  it('(e) returns auth response for the existing user when (provider, sub) account already exists', async () => {
    googleAuth.verifyIdentityToken.mockResolvedValue(VERIFIED_GOOGLE_PAYLOAD);
    prisma.authAccount.findUnique.mockResolvedValue({ user: BASE_USER });

    const result = await service.socialLogin(
      makeSocialLoginDto(SocialProvider.GOOGLE),
    );

    expect(result.user.id).toBe(42);
    // No email lookup, no account creation
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.authAccount.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // (a) Apple-created account + Google login with same verified email → auto-link
  it('(a) auto-links Google provider to an existing social-only (Apple) account', async () => {
    googleAuth.verifyIdentityToken.mockResolvedValue(VERIFIED_GOOGLE_PAYLOAD);
    // No (GOOGLE, sub) account exists
    prisma.authAccount.findUnique.mockResolvedValue(null);
    // User exists with only APPLE provider
    prisma.user.findUnique.mockResolvedValue({
      ...BASE_USER,
      authAccounts: [{ provider: AuthProvider.APPLE }],
    });
    prisma.authAccount.create.mockResolvedValue({});

    const result = await service.socialLogin(
      makeSocialLoginDto(SocialProvider.GOOGLE),
    );

    // Same user returned — no new user created
    expect(result.user.id).toBe(42);

    // A GOOGLE AuthAccount is created for the existing userId
    expect(prisma.authAccount.create).toHaveBeenCalledWith({
      data: {
        userId: 42,
        provider: AuthProvider.GOOGLE,
        providerUserId: 'google-sub-new',
      },
    });

    // No new-user transaction
    expect(prisma.$transaction).not.toHaveBeenCalled();

    // LOGIN_METHOD_SELECTED emitted; SIGNUP_COMPLETED must NOT be emitted
    expect(analytics.track).toHaveBeenCalledWith(
      AnalyticsEventName.LOGIN_METHOD_SELECTED,
      expect.objectContaining({ userId: 42 }),
    );
    const signupCall = analytics.track.mock.calls.find(
      ([event]: [AnalyticsEventName]) =>
        event === AnalyticsEventName.SIGNUP_COMPLETED,
    );
    expect(signupCall).toBeUndefined();
  });

  // (b) Email/password account + Google login same email → ConflictException (takeover guard)
  it('(b) throws ConflictException when existing user has an EMAIL auth provider', async () => {
    googleAuth.verifyIdentityToken.mockResolvedValue(VERIFIED_GOOGLE_PAYLOAD);
    prisma.authAccount.findUnique.mockResolvedValue(null);
    // User exists with EMAIL + APPLE providers
    prisma.user.findUnique.mockResolvedValue({
      ...BASE_USER,
      authAccounts: [
        { provider: AuthProvider.EMAIL },
        { provider: AuthProvider.APPLE },
      ],
    });

    await expect(
      service.socialLogin(makeSocialLoginDto(SocialProvider.GOOGLE)),
    ).rejects.toThrow(ConflictException);

    expect(prisma.authAccount.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // (c) emailVerified=false + social-only account → ConflictException
  it('(c) throws ConflictException when the social token has emailVerified=false', async () => {
    googleAuth.verifyIdentityToken.mockResolvedValue(UNVERIFIED_GOOGLE_PAYLOAD);
    prisma.authAccount.findUnique.mockResolvedValue(null);
    // User exists with only APPLE provider (social-only, would otherwise be linkable)
    prisma.user.findUnique.mockResolvedValue({
      ...BASE_USER,
      authAccounts: [{ provider: AuthProvider.APPLE }],
    });

    await expect(
      service.socialLogin(makeSocialLoginDto(SocialProvider.GOOGLE)),
    ).rejects.toThrow(ConflictException);

    expect(prisma.authAccount.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // (d) No existing user → new user + AuthAccount created (unchanged path)
  it('(d) creates a new user when no account exists for the email', async () => {
    googleAuth.verifyIdentityToken.mockResolvedValue({
      sub: 'google-sub-brand-new',
      email: 'newuser@example.com',
      emailVerified: true,
    });
    prisma.authAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null); // no existing user

    const createdUser = {
      id: 99,
      email: 'newuser@example.com',
      displayName: 'newuser',
      avatarUrl: null as string | null,
    };

    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<typeof createdUser>) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue(createdUser) },
          authAccount: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      },
    );

    const result = await service.socialLogin({
      provider: SocialProvider.GOOGLE,
      identityToken: 'test-token',
      email: 'newuser@example.com',
    });

    expect(result.user.id).toBe(99);
    expect(prisma.$transaction).toHaveBeenCalled();

    // SIGNUP_COMPLETED emitted for new users
    expect(analytics.track).toHaveBeenCalledWith(
      AnalyticsEventName.SIGNUP_COMPLETED,
      expect.objectContaining({ userId: 99 }),
    );
  });

  // (f) Hardening: null token email must NOT auto-link, even if dto.email
  // matches an existing social-only user with a verified-looking flag set.
  it('(f) does not auto-link when tokenPayload.email is null, even if dto.email matches an existing user', async () => {
    googleAuth.verifyIdentityToken.mockResolvedValue({
      sub: 'google-sub-no-email',
      email: null,
      emailVerified: true,
    });
    prisma.authAccount.findUnique.mockResolvedValue(null);
    // If the (buggy) code looked up by dto.email, this would be "found" and
    // incorrectly auto-linked into user 42.
    prisma.user.findUnique.mockResolvedValue({
      ...BASE_USER,
      authAccounts: [{ provider: AuthProvider.APPLE }],
    });

    const createdUser = {
      id: 100,
      email: 'alice@example.com',
      displayName: 'alice',
      avatarUrl: null as string | null,
    };
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<typeof createdUser>) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue(createdUser) },
          authAccount: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      },
    );

    const result = await service.socialLogin(
      makeSocialLoginDto(SocialProvider.GOOGLE, 'alice@example.com'),
    );

    // The dto.email-keyed existing user (id 42) must never be looked up or
    // linked into — the flow instead falls through to new-account creation.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result.user.id).toBe(100);

    // SIGNUP_COMPLETED for the brand-new user 100, never LOGIN_METHOD_SELECTED
    // (or anything else) for the pre-existing user 42.
    expect(analytics.track).toHaveBeenCalledWith(
      AnalyticsEventName.SIGNUP_COMPLETED,
      expect.objectContaining({ userId: 100 }),
    );
    const linkedIntoExistingUser = analytics.track.mock.calls.some(
      ([, payload]: [AnalyticsEventName, { userId: number }]) =>
        payload.userId === 42,
    );
    expect(linkedIntoExistingUser).toBe(false);
  });

  // (g) Duplicate-provider guard: existing user already has an AuthAccount
  // for this same provider (different sub) → refuse instead of creating a
  // second row for the same provider.
  it('(g) throws ConflictException when the existing user already has an AuthAccount for this provider', async () => {
    googleAuth.verifyIdentityToken.mockResolvedValue(VERIFIED_GOOGLE_PAYLOAD);
    // No exact (GOOGLE, sub) match — but the user already has *a* GOOGLE account
    prisma.authAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      ...BASE_USER,
      authAccounts: [{ provider: AuthProvider.GOOGLE }],
    });

    await expect(
      service.socialLogin(makeSocialLoginDto(SocialProvider.GOOGLE)),
    ).rejects.toThrow(ConflictException);

    expect(prisma.authAccount.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
