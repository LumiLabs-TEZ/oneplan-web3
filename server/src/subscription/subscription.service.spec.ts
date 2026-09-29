import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsEventName, SubscriptionStatus } from '@prisma/client';
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
} from '@apple/app-store-server-library';
import { PrismaService } from '../prisma/prisma.service';
import { ScanCreditService } from '../scan-credit/scan-credit.service';
import { SubscriptionService } from './subscription.service';
import { AppleStoreAdapter } from './adapters/apple-store.adapter';
import { PlayStoreAdapter } from './adapters/play-store.adapter';
import { StoreEventProcessor } from './store-event/store-event.processor';
import { EntitlementService } from './entitlement/entitlement.service';

const makeAppleAdapterMock = () => new AppleStoreAdapter();
const makePlayAdapterMock = () => new PlayStoreAdapter();
const processorMock = {
  process: jest.fn().mockResolvedValue('PROCESSED'),
  replayOrphans: jest.fn().mockResolvedValue(0),
};

// Default mock: treat every product as a non-credit auto-renewable so the
// existing tests exercise the original updateUserSubscription path unchanged.
const makeScanCreditMock = () =>
  ({
    isCreditProduct: jest.fn().mockReturnValue(false),
    isAutoRenewableSku: jest.fn().mockReturnValue(false),
    reconcileProGrants: jest.fn().mockResolvedValue(undefined),
    grantPurchase: jest.fn().mockResolvedValue(undefined),
    revokePurchase: jest.fn().mockResolvedValue({
      userId: 1,
      productId: 'scan_pack_15',
      grantedAmount: 15,
      clawedBack: 5,
      consumedAtRefund: 10,
      restored: 0,
      applied: true,
    }),
    restorePurchase: jest.fn().mockResolvedValue({
      userId: 1,
      productId: 'scan_pack_15',
      grantedAmount: 15,
      clawedBack: 0,
      consumedAtRefund: 10,
      restored: 5,
      applied: true,
    }),
    peekPurchaseGrant: jest.fn().mockResolvedValue({
      userId: 1,
      productId: 'scan_pack_15',
      grantedAmount: 15,
      remaining: 3,
    }),
  }) as unknown as ScanCreditService;

// Mock the @apple/app-store-server-library
jest.mock('@apple/app-store-server-library', () => ({
  AppStoreServerAPIClient: jest.fn().mockImplementation(() => ({
    getAllSubscriptionStatuses: jest.fn(),
    setAppAccountToken: jest.fn(),
  })),
  Environment: {
    SANDBOX: 'Sandbox',
    PRODUCTION: 'Production',
    XCODE: 'Xcode',
    LOCAL_TESTING: 'LocalTesting',
  },
  SignedDataVerifier: jest.fn().mockImplementation(() => ({
    verifyAndDecodeTransaction: jest.fn(),
    verifyAndDecodeNotification: jest.fn(),
    verifyAndDecodeRenewalInfo: jest.fn(),
  })),
  NotificationTypeV2: {
    TEST: 'TEST',
    SUBSCRIBED: 'SUBSCRIBED',
    DID_RENEW: 'DID_RENEW',
    EXPIRED: 'EXPIRED',
    DID_CHANGE_RENEWAL_STATUS: 'DID_CHANGE_RENEWAL_STATUS',
    REFUND: 'REFUND',
    REFUND_REVERSED: 'REFUND_REVERSED',
    REFUND_DECLINED: 'REFUND_DECLINED',
    REVOKE: 'REVOKE',
    GRACE_PERIOD_EXPIRED: 'GRACE_PERIOD_EXPIRED',
    DID_FAIL_TO_RENEW: 'DID_FAIL_TO_RENEW',
  },
  Status: {
    ACTIVE: 1,
    EXPIRED: 2,
    BILLING_RETRY: 3,
    BILLING_GRACE_PERIOD: 4,
    REVOKED: 5,
  },
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('mock-cert')),
}));

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prisma: any;
  let configService: any;
  let playVerifier: any;
  let scanCreditMock: any;
  let analyticsMock: any;

  const mockTransaction = {
    transactionId: 'txn_123',
    originalTransactionId: 'orig_txn_123',
    productId: 'com.oneplan.subscription.monthly',
    purchaseDate: Date.now() - 86400000, // 1 day ago
    expiresDate: Date.now() + 30 * 86400000, // 30 days from now
    environment: 'Sandbox',
    type: 'Auto-Renewable Subscription',
  };
  const createUnsignedJws = (payload: Record<string, unknown>) => {
    const encode = (value: Record<string, unknown>) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'none' })}.${encode(payload)}.signature`;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      subscriptionTransaction: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      storeNotification: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          APP_STORE_BUNDLE_ID: 'com.oneplan.app',
          APP_STORE_APP_APPLE_ID: '123456789',
          APP_STORE_ISSUER_ID: 'issuer-id',
          APP_STORE_KEY_ID: 'key-id',
          APP_STORE_PRIVATE_KEY: Buffer.from('private-key').toString('base64'),
          APP_STORE_ENVIRONMENT: 'Auto',
        };
        return config[key] ?? defaultValue;
      }),
    };

    playVerifier = {
      isConfigured: jest.fn().mockReturnValue(true),
      verifyAndAcknowledge: jest.fn(),
    };
    scanCreditMock = makeScanCreditMock();
    analyticsMock = { track: jest.fn() };
    service = new SubscriptionService(
      prisma as PrismaService,
      configService as ConfigService,
      analyticsMock,
      playVerifier,
      scanCreditMock,
      makeAppleAdapterMock(),
      processorMock as unknown as StoreEventProcessor,
      makePlayAdapterMock(),
    );
  });

  describe('getSubscriptionStatus', () => {
    it('returns NONE status when user is not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getSubscriptionStatus(999);

      expect(result).toEqual({
        status: SubscriptionStatus.NONE,
        tier: 'free',
        productId: null,
        expiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });
    });

    it('returns subscription status for existing user', async () => {
      const expiresAt = new Date('2026-05-12T00:00:00.000Z');
      const gracePeriodExpiresAt = new Date('2026-04-15T00:00:00.000Z');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.GRACE_PERIOD,
        subscriptionProductId: 'com.oneplan.subscription.monthly',
        subscriptionExpiresAt: expiresAt,
        autoRenewEnabled: true,
        gracePeriodExpiresAt,
      });

      const result = await service.getSubscriptionStatus(1);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          subscriptionStatus: true,
          subscriptionProductId: true,
          subscriptionExpiresAt: true,
          autoRenewEnabled: true,
          gracePeriodExpiresAt: true,
        },
      });

      expect(result).toEqual({
        status: SubscriptionStatus.GRACE_PERIOD,
        tier: 'free',
        productId: 'com.oneplan.subscription.monthly',
        expiresAt: '2026-05-12T00:00:00.000Z',
        autoRenewEnabled: true,
        gracePeriodExpiresAt: '2026-04-15T00:00:00.000Z',
      });
    });

    it('resolves pro_yearly tier for an active subscription SKU', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionProductId: 'pro_yearly',
        subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
        autoRenewEnabled: true,
        gracePeriodExpiresAt: null,
      });

      const result = await service.getSubscriptionStatus(1);

      expect(result.tier).toBe('pro_yearly');
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('pay_once outranks subscription SKU via transaction ledger', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.EXPIRED,
        subscriptionProductId: 'pro_weekly',
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });
      (prisma.subscriptionTransaction.findFirst as jest.Mock).mockResolvedValue(
        { id: 42 },
      );

      const result = await service.getSubscriptionStatus(1);

      expect(result.tier).toBe('pay_once');
    });

    it('returns null dates when not set', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      const result = await service.getSubscriptionStatus(1);

      expect(result).toEqual({
        status: SubscriptionStatus.NONE,
        tier: 'free',
        productId: null,
        expiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });
    });
  });

  describe('resolveTier — expiry guard', () => {
    const baseUser = {
      subscriptionProductId: 'pro_monthly',
      autoRenewEnabled: true,
      gracePeriodExpiresAt: null,
    };

    it('ACTIVE + future expiry -> entitled', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: new Date(Date.now() + 86400000),
      });

      const result = await service.getSubscriptionStatus(1);

      expect(result.tier).toBe('pro_monthly');
    });

    it('ACTIVE + past expiry -> NOT entitled (the bug)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: new Date(Date.now() - 86400000),
      });

      const result = await service.getSubscriptionStatus(1);

      expect(result.tier).toBe('free');
    });

    it('ACTIVE + null expiry -> entitled', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: null,
      });

      const result = await service.getSubscriptionStatus(1);

      expect(result.tier).toBe('pro_monthly');
    });

    it('GRACE_PERIOD + past expiry -> entitled (must not regress)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        subscriptionStatus: SubscriptionStatus.GRACE_PERIOD,
        subscriptionExpiresAt: new Date(Date.now() - 86400000),
      });

      const result = await service.getSubscriptionStatus(1);

      expect(result.tier).toBe('pro_monthly');
    });

    it('BILLING_RETRY + past expiry -> entitled (must not regress)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        subscriptionStatus: SubscriptionStatus.BILLING_RETRY,
        subscriptionExpiresAt: new Date(Date.now() - 86400000),
      });

      const result = await service.getSubscriptionStatus(1);

      expect(result.tier).toBe('pro_monthly');
    });

    it('PAY_ONCE -> entitled regardless of subscriptionStatus/expiry (unchanged)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        subscriptionStatus: SubscriptionStatus.EXPIRED,
        subscriptionExpiresAt: new Date(Date.now() - 86400000),
      });
      (prisma.subscriptionTransaction.findFirst as jest.Mock).mockResolvedValue(
        { id: 42 },
      );

      const result = await service.getSubscriptionStatus(1);

      expect(result.tier).toBe('pay_once');
    });
  });

  describe('stale-ACTIVE read guard', () => {
    const baseUser = {
      subscriptionProductId: 'pro_monthly',
      autoRenewEnabled: true,
      gracePeriodExpiresAt: null,
    };

    it('reports EXPIRED status (not raw stored ACTIVE) once stale', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: new Date(Date.now() - 86400000),
      });

      const result = await service.getSubscriptionStatus(1);

      expect(result.status).toBe(SubscriptionStatus.EXPIRED);
      expect(result.tier).toBe('free');
    });
  });

  describe('verifyPlayPurchase', () => {
    const baseDto = {
      packageName: 'com.oneplan.app',
      productId: 'pro_yearly',
      purchaseToken: 'play-token-abc',
      orderId: 'GPA.1',
      purchaseTimeMillis: '1711627200000',
      purchaseState: 0,
    };

    it('throws BadRequestException when Play verification is not configured', async () => {
      (playVerifier.isConfigured as jest.Mock).mockReturnValue(false);

      await expect(
        service.verifyPlayPurchase(1, baseDto as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(playVerifier.verifyAndAcknowledge).not.toHaveBeenCalled();
    });

    it('rejects an unsupported (non-allowlisted) product before verification', async () => {
      await expect(
        service.verifyPlayPurchase(1, {
          ...baseDto,
          productId: 'some_other_app_sub',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(playVerifier.verifyAndAcknowledge).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('fails closed (no entitlement) when a valid purchase is not acknowledged', async () => {
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_yearly',
        purchaseToken: 'play-token-abc',
        orderId: 'GPA.1',
        active: true,
        acknowledged: false,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        revoked: false,
      });

      await expect(
        service.verifyPlayPurchase(1, baseDto as any),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.subscriptionTransaction.create).not.toHaveBeenCalled();
    });

    it('grants ACTIVE entitlement and tier for a verified subscription', async () => {
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_yearly',
        purchaseToken: 'play-token-abc',
        orderId: 'GPA.1',
        active: true,
        acknowledged: true,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        revoked: false,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.subscriptionTransaction.create as jest.Mock).mockResolvedValue(
        {},
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionProductId: 'pro_yearly',
        subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
        autoRenewEnabled: true,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, baseDto as any);

      expect(playVerifier.verifyAndAcknowledge).toHaveBeenCalledWith(
        baseDto,
        'subscription',
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionProductId: 'pro_yearly',
          originalTransactionId: 'play-token-abc',
          autoRenewEnabled: true,
        }),
      });
      // Ledger write moved into EntitlementService (via storeEventProcessor).
      expect(processorMock.process).toHaveBeenCalled();
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.tier).toBe('pro_yearly');
    });

    it('grants Pro credit IMMEDIATELY when Play sub verification succeeds (previously lazy)', async () => {
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_yearly',
        purchaseToken: 'play-token-abc',
        orderId: 'GPA.1',
        active: true,
        acknowledged: true,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        revoked: false,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.subscriptionTransaction.create as jest.Mock).mockResolvedValue(
        {},
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionProductId: 'pro_yearly',
        subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
        autoRenewEnabled: true,
        gracePeriodExpiresAt: null,
      });

      await service.verifyPlayPurchase(1, baseDto as any);

      expect(processorMock.process).toHaveBeenCalledWith(
        expect.objectContaining({
          store: 'GOOGLE',
          source: 'CLIENT_VERIFY',
          kind: 'SUBSCRIPTION_STATE',
          lineId: 'play-token-abc',
        }),
      );
    });

    it('does not overwrite user status for a pay_once product purchase', async () => {
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'product',
        productId: 'pay_once',
        purchaseToken: 'play-token-once',
        orderId: 'GPA.2',
        active: true,
        acknowledged: true,
        expiresAt: null,
        startedAt: new Date('2026-02-01T00:00:00.000Z'),
        revoked: false,
      });
      (prisma.subscriptionTransaction.create as jest.Mock).mockResolvedValue(
        {},
      );
      (prisma.subscriptionTransaction.findFirst as jest.Mock).mockResolvedValue(
        { id: 7 },
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, {
        ...baseDto,
        productId: 'pay_once',
      } as any);

      expect(playVerifier.verifyAndAcknowledge).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'pay_once' }),
        'product',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result.tier).toBe('pay_once');
    });

    it('marks entitlement EXPIRED (not REVOKED) when Google reports a cancelled-then-lapsed subscription', async () => {
      // `revoked: true` here means "expired && cancelledInPast" — the
      // normal end of life of a cancelled subscription, not a refund. A
      // genuine refund is a separate voidedPurchaseNotification RTDN
      // (see 'handlePlayWebhook — genuine subscription refund' below) and
      // must persist REVOKED there; this case must not reuse that status.
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_monthly',
        purchaseToken: 'play-token-revoked',
        orderId: null,
        active: false,
        acknowledged: true,
        expiresAt: new Date(Date.now() - 86400000),
        startedAt: new Date(Date.now() - 30 * 86400000),
        revoked: true,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.subscriptionTransaction.create as jest.Mock).mockResolvedValue(
        {},
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.EXPIRED,
        subscriptionProductId: 'pro_monthly',
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, {
        ...baseDto,
        productId: 'pro_monthly',
      } as any);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.EXPIRED,
          autoRenewEnabled: false,
        }),
      });
      expect(result.status).toBe(SubscriptionStatus.EXPIRED);
    });

    it('rejects when the pay_once ledger insert fails with a non-duplicate error (fail-closed)', async () => {
      // Ledger write moved into EntitlementService.upsertLedger (invoked via
      // storeEventProcessor.process) — simulate its failure the same way the
      // rest of this suite treats StoreEventProcessor as an isolated unit.
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'product',
        productId: 'pay_once',
        purchaseToken: 'play-token-ledger-fail',
        orderId: 'GPA.3',
        active: true,
        acknowledged: true,
        expiresAt: null,
        startedAt: new Date('2026-02-01T00:00:00.000Z'),
        revoked: false,
      });
      processorMock.process.mockRejectedValueOnce(
        new Error('connection reset'),
      );

      await expect(
        service.verifyPlayPurchase(1, {
          ...baseDto,
          productId: 'pay_once',
        } as any),
      ).rejects.toThrow('connection reset');
      // No entitlement was ever resolved/returned to the caller — Google was
      // already charged, but the caller sees a failure and must retry.
      expect(prisma.subscriptionTransaction.findFirst).not.toHaveBeenCalled();
    });

    it('resolves idempotently (no throw) when the pay_once ledger insert is a duplicate (P2002)', async () => {
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'product',
        productId: 'pay_once',
        purchaseToken: 'play-token-once-dup',
        orderId: 'GPA.4',
        active: true,
        acknowledged: true,
        expiresAt: null,
        startedAt: new Date('2026-02-01T00:00:00.000Z'),
        revoked: false,
      });
      (prisma.subscriptionTransaction.create as jest.Mock).mockRejectedValue({
        code: 'P2002',
      });
      (prisma.subscriptionTransaction.findFirst as jest.Mock).mockResolvedValue(
        { id: 9 },
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, {
        ...baseDto,
        productId: 'pay_once',
        purchaseToken: 'play-token-once-dup',
      } as any);

      expect(result.tier).toBe('pay_once');
    });

    it('retrying the same token after a first success stays idempotent (P2002 path), entitlement intact', async () => {
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'product',
        productId: 'pay_once',
        purchaseToken: 'play-token-retry',
        orderId: 'GPA.5',
        active: true,
        acknowledged: true,
        expiresAt: null,
        startedAt: new Date('2026-02-01T00:00:00.000Z'),
        revoked: false,
      });
      (prisma.subscriptionTransaction.findFirst as jest.Mock).mockResolvedValue(
        { id: 11 },
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      // First call: ledger insert succeeds.
      (
        prisma.subscriptionTransaction.create as jest.Mock
      ).mockResolvedValueOnce({});
      const first = await service.verifyPlayPurchase(1, {
        ...baseDto,
        productId: 'pay_once',
        purchaseToken: 'play-token-retry',
      } as any);
      expect(first.tier).toBe('pay_once');

      // Retry with the same token (e.g. client retried after a transient
      // network error before seeing the first response): duplicate insert
      // hits P2002 and is treated as idempotent success, not a failure.
      (
        prisma.subscriptionTransaction.create as jest.Mock
      ).mockRejectedValueOnce({ code: 'P2002' });
      const second = await service.verifyPlayPurchase(1, {
        ...baseDto,
        productId: 'pay_once',
        purchaseToken: 'play-token-retry',
      } as any);
      expect(second.tier).toBe('pay_once');
    });

    // §5 server test-purchase guard (GOOGLE_PLAY_ENVIRONMENT).
    const setPlayEnvironment = (value: string) => {
      const original = (configService.get as jest.Mock).getMockImplementation();
      (configService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue?: string) =>
          key === 'GOOGLE_PLAY_ENVIRONMENT'
            ? value
            : original(key, defaultValue),
      );
    };

    it('handles a Play TEST purchase in Production as FREE — no ledger row, no grant, no throw', async () => {
      setPlayEnvironment('Production');
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_yearly',
        purchaseToken: 'play-token-test-in-prod',
        orderId: 'GPA.9',
        active: true,
        acknowledged: true,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        revoked: false,
        isTest: true,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, {
        ...baseDto,
        purchaseToken: 'play-token-test-in-prod',
      } as any);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.subscriptionTransaction.create).not.toHaveBeenCalled();
      expect(result.status).toBe(SubscriptionStatus.NONE);
      expect(result.tier).toBe('free');
    });

    it('fails safe: with GOOGLE_PLAY_ENVIRONMENT unset (absent from config), a TEST purchase is rejected, not granted', async () => {
      // Deliberately does NOT call setPlayEnvironment — configService.get
      // falls through to the caller-supplied default, exactly as it would if
      // the Joi-validated env var were never set. This must resolve to
      // 'Production' (safe-by-default), not 'Auto' (which would grant Pro).
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_yearly',
        purchaseToken: 'play-token-unset-env',
        orderId: 'GPA.15',
        active: true,
        acknowledged: true,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        revoked: false,
        isTest: true,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, {
        ...baseDto,
        purchaseToken: 'play-token-unset-env',
      } as any);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.subscriptionTransaction.create).not.toHaveBeenCalled();
      expect(result.status).toBe(SubscriptionStatus.NONE);
      expect(result.tier).toBe('free');
    });

    it('accepts a Play TEST purchase in Test environment and labels the ledger row Test', async () => {
      setPlayEnvironment('Test');
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_monthly',
        purchaseToken: 'play-token-dev-test',
        orderId: 'GPA.10',
        active: true,
        acknowledged: true,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        revoked: false,
        isTest: true,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.subscriptionTransaction.create as jest.Mock).mockResolvedValue(
        {},
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionProductId: 'pro_monthly',
        subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
        autoRenewEnabled: true,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, {
        ...baseDto,
        productId: 'pro_monthly',
        purchaseToken: 'play-token-dev-test',
      } as any);

      expect(prisma.user.update).toHaveBeenCalled();
      expect(processorMock.process).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'Test' }),
      );
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('accepts a real (non-test) purchase in Production environment (regression)', async () => {
      setPlayEnvironment('Production');
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_weekly',
        purchaseToken: 'play-token-real-prod',
        orderId: 'GPA.11',
        active: true,
        acknowledged: true,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        revoked: false,
        isTest: false,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.subscriptionTransaction.create as jest.Mock).mockResolvedValue(
        {},
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionProductId: 'pro_weekly',
        subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
        autoRenewEnabled: true,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, {
        ...baseDto,
        productId: 'pro_weekly',
        purchaseToken: 'play-token-real-prod',
      } as any);

      expect(prisma.user.update).toHaveBeenCalled();
      expect(processorMock.process).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'Production' }),
      );
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('accepts a Play TEST purchase in Auto environment and labels the ledger row Test', async () => {
      setPlayEnvironment('Auto');
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_weekly',
        purchaseToken: 'play-token-auto-test',
        orderId: 'GPA.12',
        active: true,
        acknowledged: true,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        revoked: false,
        isTest: true,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.subscriptionTransaction.create as jest.Mock).mockResolvedValue(
        {},
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionProductId: 'pro_weekly',
        subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
        autoRenewEnabled: true,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, {
        ...baseDto,
        productId: 'pro_weekly',
        purchaseToken: 'play-token-auto-test',
      } as any);

      expect(prisma.user.update).toHaveBeenCalled();
      expect(processorMock.process).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'Test' }),
      );
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('rejects when the ledger insert fails with a non-duplicate error even for a real purchase in Production (fail-closed unchanged)', async () => {
      setPlayEnvironment('Production');
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_weekly',
        purchaseToken: 'play-token-prod-fail',
        orderId: 'GPA.13',
        active: true,
        acknowledged: true,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        revoked: false,
        isTest: false,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      processorMock.process.mockRejectedValueOnce(
        new Error('connection reset'),
      );

      await expect(
        service.verifyPlayPurchase(1, {
          ...baseDto,
          productId: 'pro_weekly',
          purchaseToken: 'play-token-prod-fail',
        } as any),
      ).rejects.toThrow('connection reset');
    });

    it('stays idempotent (P2002) for a duplicate real purchase in Production', async () => {
      setPlayEnvironment('Production');
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_weekly',
        purchaseToken: 'play-token-prod-dup',
        orderId: 'GPA.14',
        active: true,
        acknowledged: true,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        revoked: false,
        isTest: false,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.subscriptionTransaction.create as jest.Mock).mockRejectedValue({
        code: 'P2002',
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionProductId: 'pro_weekly',
        subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
        autoRenewEnabled: true,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, {
        ...baseDto,
        productId: 'pro_weekly',
        purchaseToken: 'play-token-prod-dup',
      } as any);

      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });
  });

  describe('verifyPlayPurchase — scan-credit packs', () => {
    const packDto = {
      packageName: 'com.oneplan.app',
      productId: 'oneplan.video_scan_5',
      purchaseToken: 'play-token-pack-1',
      orderId: 'GPA.20',
      purchaseTimeMillis: '1711627200000',
      purchaseState: 0,
    };

    // isCreditProduct is a real classification call in production; the
    // default test mock always returns false so the pre-existing
    // subscription/pay_once tests keep exercising their original path. Only
    // these scan-pack tests need it to recognize the pack SKU.
    beforeEach(() => {
      (scanCreditMock.isCreditProduct as jest.Mock).mockImplementation(
        (productId: string) => productId === 'oneplan.video_scan_5',
      );
    });

    it('grants scan credits for a verified credit-pack purchase and never touches subscription state', async () => {
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'product',
        productId: 'oneplan.video_scan_5',
        purchaseToken: 'play-token-pack-1',
        orderId: 'GPA.20',
        active: true,
        acknowledged: true,
        expiresAt: null,
        startedAt: new Date('2026-03-01T00:00:00.000Z'),
        revoked: false,
        isTest: false,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, packDto as any);

      expect(playVerifier.verifyAndAcknowledge).toHaveBeenCalledWith(
        packDto,
        'product',
      );
      expect(scanCreditMock.grantPurchase).toHaveBeenCalledWith(
        1,
        'oneplan.video_scan_5',
        'play-token-pack-1',
        'Production',
      );
      // Never routes through subscription-state writes — a consumable has no
      // expiresDate, so deriving ACTIVE from it would clobber the user's real
      // subscription.
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result.status).toBe(SubscriptionStatus.NONE);
      expect(result.tier).toBe('free');
    });

    it('replaying the same purchaseToken is a no-op — grantPurchase is called with the identical idempotency key both times', async () => {
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'product',
        productId: 'oneplan.video_scan_5',
        purchaseToken: 'play-token-pack-replay',
        orderId: 'GPA.21',
        active: true,
        acknowledged: true,
        expiresAt: null,
        startedAt: new Date('2026-03-01T00:00:00.000Z'),
        revoked: false,
        isTest: false,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      const first = await service.verifyPlayPurchase(1, {
        ...packDto,
        purchaseToken: 'play-token-pack-replay',
      } as any);
      const second = await service.verifyPlayPurchase(1, {
        ...packDto,
        purchaseToken: 'play-token-pack-replay',
      } as any);

      // ScanCreditService.grantPurchase owns the actual dedupe (via the
      // scan_credit_grant_purchase_txn_uq partial unique index on
      // (userId, externalRef)); this asserts the subscription-service side
      // hands it the SAME externalRef (the Play purchaseToken) on replay, so
      // a retried verify can never mint a second grant.
      expect(scanCreditMock.grantPurchase).toHaveBeenCalledTimes(2);
      expect(scanCreditMock.grantPurchase).toHaveBeenNthCalledWith(
        1,
        1,
        'oneplan.video_scan_5',
        'play-token-pack-replay',
        'Production',
      );
      expect(scanCreditMock.grantPurchase).toHaveBeenNthCalledWith(
        2,
        1,
        'oneplan.video_scan_5',
        'play-token-pack-replay',
        'Production',
      );
      expect(first.status).toBe(second.status);
    });

    it('a NEW purchaseToken for a repurchase of the same SKU grants again (not blocked as a duplicate)', async () => {
      (playVerifier.verifyAndAcknowledge as jest.Mock)
        .mockResolvedValueOnce({
          kind: 'product',
          productId: 'oneplan.video_scan_5',
          purchaseToken: 'play-token-pack-first',
          orderId: 'GPA.22',
          active: true,
          acknowledged: true,
          expiresAt: null,
          startedAt: new Date('2026-03-01T00:00:00.000Z'),
          revoked: false,
          isTest: false,
        })
        .mockResolvedValueOnce({
          kind: 'product',
          productId: 'oneplan.video_scan_5',
          purchaseToken: 'play-token-pack-second',
          orderId: 'GPA.23',
          active: true,
          acknowledged: true,
          expiresAt: null,
          startedAt: new Date('2026-03-05T00:00:00.000Z'),
          revoked: false,
          isTest: false,
        });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      await service.verifyPlayPurchase(1, {
        ...packDto,
        purchaseToken: 'play-token-pack-first',
      } as any);
      await service.verifyPlayPurchase(1, {
        ...packDto,
        purchaseToken: 'play-token-pack-second',
      } as any);

      expect(scanCreditMock.grantPurchase).toHaveBeenNthCalledWith(
        1,
        1,
        'oneplan.video_scan_5',
        'play-token-pack-first',
        'Production',
      );
      expect(scanCreditMock.grantPurchase).toHaveBeenNthCalledWith(
        2,
        1,
        'oneplan.video_scan_5',
        'play-token-pack-second',
        'Production',
      );
    });

    it('fails closed (no grant) when a valid credit-pack purchase is not acknowledged', async () => {
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'product',
        productId: 'oneplan.video_scan_5',
        purchaseToken: 'play-token-pack-unacked',
        orderId: 'GPA.24',
        active: true,
        acknowledged: false,
        expiresAt: null,
        startedAt: new Date('2026-03-01T00:00:00.000Z'),
        revoked: false,
        isTest: false,
      });

      await expect(
        service.verifyPlayPurchase(1, {
          ...packDto,
          purchaseToken: 'play-token-pack-unacked',
        } as any),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(scanCreditMock.grantPurchase).not.toHaveBeenCalled();
    });

    it('rejects a Play TEST credit-pack purchase in Production — no grant, no throw', async () => {
      const original = (configService.get as jest.Mock).getMockImplementation();
      (configService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue?: string) =>
          key === 'GOOGLE_PLAY_ENVIRONMENT'
            ? 'Production'
            : original(key, defaultValue),
      );
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'product',
        productId: 'oneplan.video_scan_5',
        purchaseToken: 'play-token-pack-test-in-prod',
        orderId: 'GPA.25',
        active: true,
        acknowledged: true,
        expiresAt: null,
        startedAt: new Date('2026-03-01T00:00:00.000Z'),
        revoked: false,
        isTest: true,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, {
        ...packDto,
        purchaseToken: 'play-token-pack-test-in-prod',
      } as any);

      expect(scanCreditMock.grantPurchase).not.toHaveBeenCalled();
      expect(result.tier).toBe('free');
    });

    it('does not grant when Google reports the credit-pack purchase as revoked/cancelled', async () => {
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'product',
        productId: 'oneplan.video_scan_5',
        purchaseToken: 'play-token-pack-revoked',
        orderId: 'GPA.26',
        active: false,
        acknowledged: true,
        expiresAt: null,
        startedAt: new Date('2026-03-01T00:00:00.000Z'),
        revoked: true,
        isTest: false,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        subscriptionStatus: SubscriptionStatus.NONE,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });

      const result = await service.verifyPlayPurchase(1, {
        ...packDto,
        purchaseToken: 'play-token-pack-revoked',
      } as any);

      expect(scanCreditMock.grantPurchase).not.toHaveBeenCalled();
      expect(result.tier).toBe('free');
    });

    it('still rejects an unknown/garbage productId as Unsupported product (isCreditProduct returns false)', async () => {
      (scanCreditMock.isCreditProduct as jest.Mock).mockReturnValue(false);

      await expect(
        service.verifyPlayPurchase(1, {
          ...packDto,
          productId: 'totally_unknown_sku',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(playVerifier.verifyAndAcknowledge).not.toHaveBeenCalled();
      expect(scanCreditMock.grantPurchase).not.toHaveBeenCalled();
    });
  });

  describe('updateUserSubscription', () => {
    it('updates user with ACTIVE status when passed Apple status 1', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      // Pass appleStatus as third parameter
      await service.updateUserSubscription(1, mockTransaction as any, 1);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionProductId: 'com.oneplan.subscription.monthly',
          subscriptionExpiresAt: expect.any(Date),
          originalTransactionId: 'orig_txn_123',
        },
      });
    });

    it('updates user with EXPIRED status when passed Apple status 2', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await service.updateUserSubscription(1, mockTransaction as any, 2);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.EXPIRED,
        }),
      });
    });

    it('updates user with BILLING_RETRY status when passed Apple status 3', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await service.updateUserSubscription(1, mockTransaction as any, 3);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.BILLING_RETRY,
        }),
      });
    });

    it('updates user with GRACE_PERIOD status when passed Apple status 4', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await service.updateUserSubscription(1, mockTransaction as any, 4);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.GRACE_PERIOD,
        }),
      });
    });

    it('updates user with REVOKED status when passed Apple status 5', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await service.updateUserSubscription(1, mockTransaction as any, 5);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.REVOKED,
        }),
      });
    });

    it('updates user with NONE status when passed unknown Apple status', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await service.updateUserSubscription(1, mockTransaction as any, 99);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.NONE,
        }),
      });
    });

    it('derives ACTIVE status from transaction when no appleStatus provided and expiresDate is in future', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      // No appleStatus passed, should derive from transaction
      await service.updateUserSubscription(1, mockTransaction as any);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.ACTIVE,
        }),
      });
    });

    it('derives EXPIRED status from transaction when expiresDate is in past', async () => {
      const expiredTransaction = {
        ...mockTransaction,
        expiresDate: Date.now() - 86400000, // 1 day ago
      };
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await service.updateUserSubscription(1, expiredTransaction as any);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.EXPIRED,
        }),
      });
    });

    it('derives REVOKED status from transaction when revocationDate is set', async () => {
      const revokedTransaction = {
        ...mockTransaction,
        revocationDate: Date.now() - 86400000,
      };
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await service.updateUserSubscription(1, revokedTransaction as any);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.REVOKED,
        }),
      });
    });

    it('handles null expiresDate - treats as active', async () => {
      const noExpiryTransaction = { ...mockTransaction, expiresDate: null };
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await service.updateUserSubscription(1, noExpiryTransaction as any);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          subscriptionExpiresAt: null,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
        }),
      });
    });
  });

  describe('validateTransaction', () => {
    it('throws BadRequestException when verifier is not configured', async () => {
      // Service has no verifier initialized (default state in tests)
      await expect(
        service.validateTransaction(1, 'invalid-jws'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.validateTransaction(1, 'invalid-jws'),
      ).rejects.toThrow('Subscription validation is not configured');
    });

    it('rejects a Pro transaction already linked to another user', async () => {
      service.onModuleInit();
      const verifier = (SignedDataVerifier as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      verifier.verifyAndDecodeTransaction.mockResolvedValue(mockTransaction);
      prisma.user.findUnique.mockResolvedValue({ id: 2 });

      await expect(
        service.validateTransaction(
          1,
          createUnsignedJws({
            bundleId: 'com.oneplan.app',
            environment: Environment.SANDBOX,
          }),
        ),
      ).rejects.toThrow('Subscription is already linked to another account');

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.subscriptionTransaction.create).not.toHaveBeenCalled();
      expect(scanCreditMock.reconcileProGrants).not.toHaveBeenCalled();
    });

    it('reassigns (does not reject) a local Xcode transaction already linked to another user', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: string) => {
          const config: Record<string, string> = {
            APP_STORE_BUNDLE_ID: 'com.oneplan.app',
            APP_STORE_APP_APPLE_ID: '123456789',
            APP_STORE_ENVIRONMENT: 'Xcode',
          };
          return config[key] ?? defaultValue;
        },
      );
      service = new SubscriptionService(
        prisma as PrismaService,
        configService as ConfigService,
        { track: jest.fn() } as any,
        playVerifier,
        scanCreditMock,
        makeAppleAdapterMock(),
        processorMock as unknown as StoreEventProcessor,
        makePlayAdapterMock(),
      );
      service.onModuleInit();

      const verifier = (SignedDataVerifier as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      verifier.verifyAndDecodeTransaction.mockResolvedValue({
        ...mockTransaction,
        environment: Environment.XCODE,
      });
      // 1st findUnique → ownership check finds a DIFFERENT user (id 2).
      // 2nd findUnique → getSubscriptionStatus(1) at the end.
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 2 })
        .mockResolvedValueOnce({
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionProductId: mockTransaction.productId,
          subscriptionExpiresAt: new Date(mockTransaction.expiresDate),
          autoRenewEnabled: false,
          gracePeriodExpiresAt: null,
        });
      prisma.user.update.mockResolvedValue({});
      prisma.subscriptionTransaction.create.mockResolvedValue({});

      await expect(
        service.validateTransaction(
          1,
          createUnsignedJws({
            bundleId: 'com.oneplan.app',
            environment: Environment.XCODE,
          }),
        ),
      ).resolves.toBeDefined();

      // Prior owner (user 2) has the colliding otid cleared so the @unique
      // constraint is freed before the caller (user 1) claims it.
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: {
          originalTransactionId: null,
          subscriptionStatus: SubscriptionStatus.NONE,
          subscriptionProductId: null,
          subscriptionExpiresAt: null,
        },
      });
      // The caller's subscription is still updated afterwards.
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });

    it('reassigns a reused local StoreKit transactionId to the caller so Pro credits still reconcile', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: string) => {
          const config: Record<string, string> = {
            APP_STORE_BUNDLE_ID: 'com.oneplan.app',
            APP_STORE_APP_APPLE_ID: '123456789',
            APP_STORE_ENVIRONMENT: 'Xcode',
          };
          return config[key] ?? defaultValue;
        },
      );
      service = new SubscriptionService(
        prisma as PrismaService,
        configService as ConfigService,
        { track: jest.fn() } as any,
        playVerifier,
        scanCreditMock,
        makeAppleAdapterMock(),
        processorMock as unknown as StoreEventProcessor,
        makePlayAdapterMock(),
      );
      service.onModuleInit();

      const verifier = (SignedDataVerifier as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      verifier.verifyAndDecodeTransaction.mockResolvedValue({
        ...mockTransaction,
        environment: Environment.XCODE,
      });
      scanCreditMock.isAutoRenewableSku.mockReturnValue(true);
      // No prior User.originalTransactionId owner — isolate the
      // SubscriptionTransaction.transactionId @unique reuse path.
      prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionProductId: mockTransaction.productId,
        subscriptionExpiresAt: new Date(mockTransaction.expiresDate),
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      });
      prisma.user.update.mockResolvedValue({});
      // The reused local-StoreKit transactionId already exists (a prior dev
      // account) → the row create collides on transaction_id.
      prisma.subscriptionTransaction.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['transaction_id'] },
      });
      prisma.subscriptionTransaction.update.mockResolvedValue({});

      await expect(
        service.validateTransaction(
          1,
          createUnsignedJws({
            bundleId: 'com.oneplan.app',
            environment: Environment.XCODE,
          }),
        ),
      ).resolves.toBeDefined();

      // The colliding row is reassigned to the caller (NOT silently dropped),
      // so reconcileProGrants has a per-user row to grant the cycle from.
      expect(prisma.subscriptionTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { transactionId: mockTransaction.transactionId },
          data: expect.objectContaining({
            userId: 1,
            productId: mockTransaction.productId,
            originalTransactionId: mockTransaction.originalTransactionId,
          }),
        }),
      );
      expect(scanCreditMock.reconcileProGrants).toHaveBeenCalledWith(1);
    });

    it('does not let an expired JWS from an older chain overwrite canonical ACTIVE status', async () => {
      service.onModuleInit();
      const verifier = (SignedDataVerifier as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      const apiClient = (AppStoreServerAPIClient as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      const appAccountToken = '7389a31a-fb6d-4569-a2a6-db7d85d84813';
      const expiredTrigger = {
        ...mockTransaction,
        transactionId: 'txn_expired_history',
        originalTransactionId: 'orig_expired_history',
        productId: 'pro_weekly',
        subscriptionGroupIdentifier: 'pro-group',
        appAccountToken,
        expiresDate: Date.now() - 86400000,
      };
      const currentTransaction = {
        ...expiredTrigger,
        transactionId: 'txn_current',
        originalTransactionId: 'orig_current_active',
        expiresDate: Date.now() + 86400000,
      };

      verifier.verifyAndDecodeTransaction
        .mockResolvedValueOnce(expiredTrigger)
        .mockResolvedValueOnce(currentTransaction);
      verifier.verifyAndDecodeRenewalInfo.mockResolvedValue({
        autoRenewStatus: 1,
      });
      apiClient.getAllSubscriptionStatuses.mockResolvedValue({
        data: [
          {
            subscriptionGroupIdentifier: 'pro-group',
            lastTransactions: [
              {
                status: 1,
                signedTransactionInfo: 'current-signed',
                signedRenewalInfo: 'renewal-signed',
              },
            ],
          },
        ],
      });
      scanCreditMock.isAutoRenewableSku.mockReturnValue(true);
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ appAccountToken })
        .mockResolvedValueOnce({
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionProductId: 'pro_weekly',
          subscriptionExpiresAt: new Date(currentTransaction.expiresDate),
          autoRenewEnabled: true,
          gracePeriodExpiresAt: null,
        });
      prisma.user.update.mockResolvedValue({});
      prisma.subscriptionTransaction.create.mockResolvedValue({});

      const result = await service.validateTransaction(
        1,
        createUnsignedJws({
          bundleId: 'com.oneplan.app',
          environment: Environment.SANDBOX,
        }),
      );

      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { originalTransactionId: expiredTrigger.originalTransactionId },
      });
      expect(prisma.user.update).toHaveBeenLastCalledWith({
        where: { id: 1 },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionProductId: 'pro_weekly',
          subscriptionExpiresAt: new Date(currentTransaction.expiresDate),
          originalTransactionId: currentTransaction.originalTransactionId,
          autoRenewEnabled: true,
          gracePeriodExpiresAt: null,
        },
      });
      expect(prisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscriptionStatus: SubscriptionStatus.EXPIRED,
          }),
        }),
      );
    });

    it('Apple credit purchase still grants credit even when NO prior ledger row exists (no longer depends on logTransaction)', async () => {
      // REAL StoreEventProcessor + EntitlementService (not mocked) to prove
      // that dropping logTransaction is safe: userId is passed straight
      // through AppleStoreAdapter, so resolveUserId (ledger lookup) is never
      // called — grantPurchase still runs even when
      // subscriptionTransaction.findFirst returns null (simulating "no
      // ledger row yet").
      const processorPrisma = {
        storeNotification: {
          findUnique: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 1 }),
          upsert: jest.fn().mockResolvedValue({ id: 1 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        subscriptionTransaction: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaService;

      const entitlementPrisma = {
        $transaction: jest.fn(async (cb: any) =>
          cb({
            $executeRaw: jest.fn().mockResolvedValue(1),
            subscriptionTransaction: {
              upsert: jest.fn().mockResolvedValue({}),
            },
          }),
        ),
      } as unknown as PrismaService;

      const realScanCredit = {
        ...makeScanCreditMock(),
        isCreditProduct: jest.fn().mockReturnValue(true),
      } as unknown as ScanCreditService;

      const entitlement = new EntitlementService(
        entitlementPrisma,
        realScanCredit,
      );
      const realProcessor = new StoreEventProcessor(
        processorPrisma,
        entitlement,
      );

      const realService = new SubscriptionService(
        prisma as PrismaService,
        configService as ConfigService,
        { track: jest.fn() } as any,
        playVerifier,
        realScanCredit,
        makeAppleAdapterMock(),
        realProcessor,
        makePlayAdapterMock(),
      );
      realService.onModuleInit();

      const verifier = (SignedDataVerifier as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      verifier.verifyAndDecodeTransaction.mockResolvedValue({
        ...mockTransaction,
        transactionId: 'txn_no_ledger',
        originalTransactionId: 'orig_no_ledger',
        productId: 'oneplan.video_scan_5',
      });

      await realService.validateTransaction(
        99,
        createUnsignedJws({
          bundleId: 'com.oneplan.app',
          environment: Environment.SANDBOX,
        }),
      );

      expect(realScanCredit.grantPurchase).toHaveBeenCalledWith(
        99,
        'oneplan.video_scan_5',
        'txn_no_ledger',
        expect.any(String),
      );
      // Core proof: resolveUserId (ledger lookup) is never called because
      // event.userId is already supplied from the validateTransaction(userId, ...) parameter.
      expect(
        processorPrisma.subscriptionTransaction.findFirst,
      ).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    it('throws BadRequestException when verifier is not configured', async () => {
      await expect(service.handleWebhook('invalid-payload')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.handleWebhook('invalid-payload')).rejects.toThrow(
        'Subscription validation is not configured',
      );
    });

    it('reconciles an expired historical-chain webhook to the active same-group chain', async () => {
      service.onModuleInit();
      const verifier = (SignedDataVerifier as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      const apiClient = (AppStoreServerAPIClient as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      const expiredTransaction = {
        ...mockTransaction,
        transactionId: 'txn_expired_history',
        originalTransactionId: 'orig_expired_history',
        productId: 'pro_monthly',
        subscriptionGroupIdentifier: 'pro-group',
        expiresDate: Date.now() - 86400000,
      };
      const activeTransaction = {
        ...expiredTransaction,
        transactionId: 'txn_current',
        originalTransactionId: 'orig_current_active',
        expiresDate: Date.now() + 86400000,
      };

      verifier.verifyAndDecodeNotification.mockResolvedValue({
        notificationType: 'EXPIRED',
        notificationUUID: 'uuid-expired-history',
        signedDate: Date.now(),
        data: {
          signedTransactionInfo: 'expired-signed',
          environment: Environment.SANDBOX,
        },
      });
      verifier.verifyAndDecodeTransaction
        .mockResolvedValueOnce(expiredTransaction)
        .mockResolvedValueOnce(activeTransaction);
      verifier.verifyAndDecodeRenewalInfo.mockResolvedValue({
        autoRenewStatus: 1,
      });
      apiClient.getAllSubscriptionStatuses.mockResolvedValue({
        data: [
          {
            subscriptionGroupIdentifier: 'pro-group',
            lastTransactions: [
              {
                status: 1,
                signedTransactionInfo: 'active-signed',
                signedRenewalInfo: 'renewal-signed',
              },
            ],
          },
        ],
      });
      scanCreditMock.isAutoRenewableSku.mockReturnValue(true);
      prisma.user.findUnique.mockResolvedValue({ id: 1 });

      await service.handleWebhook(
        createUnsignedJws({
          data: {
            bundleId: 'com.oneplan.app',
            environment: Environment.SANDBOX,
          },
        }),
      );

      expect(apiClient.getAllSubscriptionStatuses).toHaveBeenCalledWith(
        expiredTransaction.transactionId,
      );
      expect(prisma.user.update).toHaveBeenLastCalledWith({
        where: { id: 1 },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionProductId: 'pro_monthly',
          subscriptionExpiresAt: new Date(activeTransaction.expiresDate),
          originalTransactionId: activeTransaction.originalTransactionId,
          autoRenewEnabled: true,
          gracePeriodExpiresAt: null,
        },
      });
      expect(prisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscriptionStatus: SubscriptionStatus.EXPIRED,
          }),
        }),
      );
    });

    it('does not modify active state for an unassociated expired historical-chain webhook', async () => {
      service.onModuleInit();
      const verifier = (SignedDataVerifier as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      const apiClient = (AppStoreServerAPIClient as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      const expiredTransaction = {
        ...mockTransaction,
        transactionId: 'txn_unlinked_expired_history',
        originalTransactionId: 'orig_unlinked_expired_history',
        productId: 'pro_weekly',
        subscriptionGroupIdentifier: 'pro-group',
        expiresDate: Date.now() - 86400000,
      };

      verifier.verifyAndDecodeNotification.mockResolvedValue({
        notificationType: 'EXPIRED',
        notificationUUID: 'uuid-unlinked-expired-history',
        signedDate: Date.now(),
        data: {
          signedTransactionInfo: 'expired-signed',
          environment: Environment.SANDBOX,
        },
      });
      verifier.verifyAndDecodeTransaction.mockResolvedValue(expiredTransaction);
      scanCreditMock.isAutoRenewableSku.mockReturnValue(true);
      prisma.user.findUnique.mockResolvedValue(null);

      await service.handleWebhook(
        createUnsignedJws({
          data: {
            bundleId: 'com.oneplan.app',
            environment: Environment.SANDBOX,
          },
        }),
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(apiClient.getAllSubscriptionStatuses).not.toHaveBeenCalled();
      expect(prisma.storeNotification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { notificationUUID: 'uuid-unlinked-expired-history' },
          update: expect.objectContaining({
            outcome: 'PROCESSED',
            originalTransactionId: expiredTransaction.originalTransactionId,
            userId: undefined,
          }),
        }),
      );
    });
  });

  describe('handleWebhook — credit-product refunds', () => {
    const fireWebhook = async (opts: {
      notificationType: string;
      productId: string;
    }) => {
      service.onModuleInit();
      const verifier = (SignedDataVerifier as jest.Mock).mock.results.map(
        (r) => r.value,
      )[0];
      verifier.verifyAndDecodeNotification.mockResolvedValue({
        notificationType: opts.notificationType,
        notificationUUID: 'uuid-refund-1',
        signedDate: Date.now(),
        data: {
          signedTransactionInfo: 'sig',
          environment: Environment.SANDBOX,
        },
      });
      verifier.verifyAndDecodeTransaction.mockResolvedValue({
        productId: opts.productId,
        transactionId: 'txn_pack_1',
        originalTransactionId: 'otxn_pack_1',
      });
      prisma.subscriptionTransaction.findUnique.mockResolvedValue(null);
      prisma.subscriptionTransaction.create.mockResolvedValue({});
      await service.handleWebhook(
        createUnsignedJws({
          data: {
            bundleId: 'com.oneplan.app',
            environment: Environment.SANDBOX,
          },
        }),
      );
    };

    it('REFUND of a scan pack revokes credits, logs, and never touches subscription state', async () => {
      scanCreditMock.isCreditProduct.mockReturnValue(true);
      await fireWebhook({
        notificationType: 'REFUND',
        productId: 'scan_pack_15',
      });

      expect(scanCreditMock.revokePurchase).toHaveBeenCalledWith(
        'otxn_pack_1',
        'txn_pack_1',
      );
      expect(scanCreditMock.restorePurchase).not.toHaveBeenCalled();
      // logged with the recovered userId
      expect(prisma.subscriptionTransaction.create).toHaveBeenCalled();
      // subscription state untouched + early-returned before the user lookup
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      // analytics: SCAN_PACK_REFUNDED with metrics
      expect(analyticsMock.track).toHaveBeenCalledWith(
        AnalyticsEventName.SCAN_PACK_REFUNDED,
        expect.objectContaining({
          userId: 1,
          properties: expect.objectContaining({
            outcome: 'revoked',
            productId: 'scan_pack_15',
            grantedAmount: 15,
            clawedBack: 5,
            consumedAtRefund: 10,
            reclaimedPct: 33,
            consumedPct: 67,
          }),
        }),
      );
    });

    it('idempotent REFUND replay (applied=false) does not emit analytics', async () => {
      scanCreditMock.isCreditProduct.mockReturnValue(true);
      scanCreditMock.revokePurchase.mockResolvedValueOnce({
        userId: 1,
        productId: 'scan_pack_15',
        grantedAmount: 15,
        clawedBack: 0,
        consumedAtRefund: 10,
        restored: 0,
        applied: false,
      });
      await fireWebhook({
        notificationType: 'REFUND',
        productId: 'scan_pack_15',
      });

      expect(prisma.subscriptionTransaction.create).toHaveBeenCalled(); // still logged
      expect(analyticsMock.track).not.toHaveBeenCalled();
    });

    it('REFUND_REVERSED of a scan pack restores credits', async () => {
      scanCreditMock.isCreditProduct.mockReturnValue(true);
      await fireWebhook({
        notificationType: 'REFUND_REVERSED',
        productId: 'scan_pack_15',
      });

      expect(scanCreditMock.restorePurchase).toHaveBeenCalledWith(
        'otxn_pack_1',
        'txn_pack_1',
      );
      expect(scanCreditMock.revokePurchase).not.toHaveBeenCalled();
      expect(analyticsMock.track).toHaveBeenCalledWith(
        AnalyticsEventName.SCAN_PACK_REFUNDED,
        expect.objectContaining({
          userId: 1,
          properties: expect.objectContaining({
            outcome: 'restored',
            restored: 5,
          }),
        }),
      );
    });

    it('REFUND_DECLINED records a declined event but no ledger change', async () => {
      scanCreditMock.isCreditProduct.mockReturnValue(true);
      await fireWebhook({
        notificationType: 'REFUND_DECLINED',
        productId: 'scan_pack_15',
      });

      expect(scanCreditMock.revokePurchase).not.toHaveBeenCalled();
      expect(scanCreditMock.restorePurchase).not.toHaveBeenCalled();
      expect(prisma.subscriptionTransaction.create).not.toHaveBeenCalled();
      expect(scanCreditMock.peekPurchaseGrant).toHaveBeenCalledWith(
        'otxn_pack_1',
        'txn_pack_1',
      );
      expect(analyticsMock.track).toHaveBeenCalledWith(
        AnalyticsEventName.SCAN_PACK_REFUNDED,
        expect.objectContaining({
          userId: 1,
          properties: expect.objectContaining({ outcome: 'declined' }),
        }),
      );
    });

    it('REFUND of a Pro SKU is NOT captured by the credit branch (regression)', async () => {
      // Default mock: isCreditProduct → false for pro SKUs.
      prisma.user.findUnique.mockResolvedValue(null);
      await fireWebhook({
        notificationType: 'REFUND',
        productId: 'pro_monthly',
      });

      expect(scanCreditMock.revokePurchase).not.toHaveBeenCalled();
      // Fell through to the subscription path (user lookup runs).
      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(analyticsMock.track).not.toHaveBeenCalledWith(
        AnalyticsEventName.SCAN_PACK_REFUNDED,
        expect.anything(),
      );
    });
  });

  describe('handleWebhook — StoreEvent path', () => {
    it('pushes Apple notifications through StoreEventProcessor with an eventId', async () => {
      service.onModuleInit();
      const verifier = (SignedDataVerifier as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      const apiClient = (AppStoreServerAPIClient as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];

      const renewedTransaction = {
        ...mockTransaction,
        transactionId: 'txn_se_1',
        originalTransactionId: 'orig_se_1',
        productId: 'pro_monthly',
      };

      verifier.verifyAndDecodeNotification.mockResolvedValue({
        notificationType: 'DID_RENEW',
        notificationUUID: 'uuid-store-event-1',
        signedDate: Date.now(),
        data: {
          signedTransactionInfo: 'signed-1',
          environment: Environment.SANDBOX,
        },
      });
      verifier.verifyAndDecodeTransaction.mockResolvedValue(renewedTransaction);
      verifier.verifyAndDecodeRenewalInfo.mockResolvedValue({
        autoRenewStatus: 1,
      });
      apiClient.getAllSubscriptionStatuses.mockResolvedValue({
        data: [
          {
            subscriptionGroupIdentifier: undefined,
            lastTransactions: [
              {
                status: 1,
                signedTransactionInfo: 'signed-1',
                signedRenewalInfo: 'renewal-signed',
              },
            ],
          },
        ],
      });
      scanCreditMock.isAutoRenewableSku.mockReturnValue(true);
      scanCreditMock.isCreditProduct.mockReturnValue(false);
      prisma.user.findUnique.mockResolvedValue({ id: 1 });

      await service.handleWebhook(
        createUnsignedJws({
          data: {
            bundleId: 'com.oneplan.app',
            environment: Environment.SANDBOX,
          },
        }),
      );

      expect(processorMock.process).toHaveBeenCalledWith(
        expect.objectContaining({
          store: 'APPLE',
          source: 'NOTIFICATION',
          eventId: 'uuid-store-event-1',
          lineId: 'orig_se_1',
          notificationType: 'DID_RENEW',
        }),
      );
    });
  });

  describe('handlePlayWebhook', () => {
    const encodeRtdn = (notification: Record<string, unknown>) =>
      Buffer.from(JSON.stringify(notification)).toString('base64');

    const renewalNotification = {
      version: '1.0',
      packageName: 'com.oneplan.app',
      eventTimeMillis: '1753798323000',
      subscriptionNotification: {
        version: '1.0',
        notificationType: 2, // SUBSCRIPTION_RENEWED
        purchaseToken: 'play-token-renew-1',
        subscriptionId: 'pro_weekly',
      },
    };

    const renewalPayload = {
      message: {
        data: encodeRtdn(renewalNotification),
        messageId: 'rtdn-msg-1',
        publishTime: '2026-07-29T14:12:03.000Z',
      },
      subscription: 'projects/oneplan/subscriptions/rtdn',
    };

    // Regression test for the incident: RTDN acked 200 but
    // subscription_expires_at never advanced (store=APPLE, user_id=NULL,
    // raw_payload empty, outcome falsely PROCESSED). Root cause: the service
    // pre-created the StoreNotification row itself before calling
    // storeEventProcessor.process(), which made THAT processor's own dedupe
    // check see the row and short-circuit as a duplicate before ever calling
    // EntitlementService.apply(). Uses the REAL StoreEventProcessor +
    // EntitlementService (only Prisma/ScanCreditService are mocked) so the
    // full pipeline — dedupe, user resolution, expiry write, ledger write,
    // scan-credit reconcile, and StoreNotification persistence — is proven
    // end to end, not just that the right function was called.
    it('a SUBSCRIPTION_RENEWED RTDN advances expiry, resolves the user, persists store=GOOGLE and the raw payload, and reconciles scan credits', async () => {
      const newExpiresAt = new Date('2026-08-05T14:12:03.000Z');

      const txUserUpdate = jest.fn().mockResolvedValue({});
      const txLedgerUpsert = jest.fn().mockResolvedValue({});
      const entitlementPrisma = {
        $transaction: jest.fn(async (cb: any) =>
          cb({
            $executeRaw: jest.fn().mockResolvedValue(1),
            subscriptionTransaction: { upsert: txLedgerUpsert },
            user: { update: txUserUpdate },
          }),
        ),
      } as unknown as PrismaService;

      const processorPrisma = {
        storeNotification: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 1 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        subscriptionTransaction: {
          // Simulates the existing ledger row created by the ORIGINAL Play
          // purchase's client-verify — this is how the RTDN resolves which
          // user owns the renewing purchaseToken.
          findFirst: jest.fn().mockResolvedValue({ userId: 34 }),
        },
      } as unknown as PrismaService;

      const realScanCredit = {
        ...makeScanCreditMock(),
        isCreditProduct: jest.fn().mockReturnValue(false),
        reconcileProGrants: jest.fn().mockResolvedValue(undefined),
      } as unknown as ScanCreditService;

      const entitlement = new EntitlementService(
        entitlementPrisma,
        realScanCredit,
      );
      const realProcessor = new StoreEventProcessor(
        processorPrisma,
        entitlement,
      );

      const realService = new SubscriptionService(
        prisma as PrismaService,
        configService as ConfigService,
        { track: jest.fn() } as any,
        playVerifier,
        realScanCredit,
        makeAppleAdapterMock(),
        realProcessor,
        makePlayAdapterMock(),
      );

      (prisma.storeNotification.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_weekly',
        purchaseToken: 'play-token-renew-1',
        active: true,
        acknowledged: true,
        expiresAt: newExpiresAt,
        startedAt: new Date('2026-07-22T14:07:00.000Z'),
        revoked: false,
      });

      await realService.handlePlayWebhook(renewalPayload as any);

      // 1. Entitlement actually advanced — the core bug.
      expect(txUserUpdate).toHaveBeenCalledWith({
        where: { id: 34 },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionProductId: 'pro_weekly',
          subscriptionExpiresAt: newExpiresAt,
          originalTransactionId: 'play-token-renew-1',
        },
      });

      // 2. The per-cycle scan-credit reconcile — coupled to the same
      // entitlement.apply() call — now actually runs for Play renewals too.
      expect(realScanCredit.reconcileProGrants).toHaveBeenCalledWith(34);

      // 3. The StoreNotification row is correct: store=GOOGLE (never the
      // schema's APPLE default), user resolved, raw payload persisted,
      // outcome genuinely PROCESSED.
      expect(processorPrisma.storeNotification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { notificationUUID: 'rtdn-msg-1' },
          update: expect.objectContaining({
            store: 'GOOGLE',
            userId: 34,
            outcome: 'PROCESSED',
            rawPayload: renewalNotification,
          }),
        }),
      );

      // 4. handlePlayWebhook must not perform a second, redundant write on
      // top of what the processor already persisted (that second write was
      // the mechanism that stomped ORPHANED/FAILED back to a false
      // PROCESSED and nulled out the transaction ids).
      expect(prisma.storeNotification.update).not.toHaveBeenCalled();
      expect(prisma.storeNotification.upsert).not.toHaveBeenCalled();
    });

    it('does not stomp an ORPHANED outcome back to PROCESSED when the user cannot be resolved', async () => {
      scanCreditMock.isCreditProduct.mockReturnValue(false);
      (prisma.storeNotification.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_weekly',
        purchaseToken: 'play-token-renew-1',
        active: true,
        acknowledged: true,
        expiresAt: new Date('2026-08-05T14:12:03.000Z'),
        startedAt: new Date('2026-07-22T14:07:00.000Z'),
        revoked: false,
      });
      processorMock.process.mockResolvedValueOnce('ORPHANED');

      await service.handlePlayWebhook(renewalPayload as any);

      expect(processorMock.process).toHaveBeenCalledWith(
        expect.objectContaining({ store: 'GOOGLE', source: 'NOTIFICATION' }),
      );
      // No follow-up write from handlePlayWebhook — the processor already
      // persisted ORPHANED, and stamping PROCESSED here would silently
      // strand the event past the point replayOrphans looks for it.
      expect(prisma.storeNotification.update).not.toHaveBeenCalled();
      expect(prisma.storeNotification.upsert).not.toHaveBeenCalled();
    });

    // Regression test for the incident this task fixes: a real Play
    // subscription cancelled mid-period (type 3 CANCELED) and left to lapse
    // (type 13 EXPIRED) never persisted a terminal subscriptionStatus. Root
    // cause: google-play-subscription-verifier's `verified.revoked` (expired
    // && cancelledInPast) made PlayStoreAdapter classify the event as
    // 'REFUND', so EntitlementService ran applyRefund() instead of
    // applySubscriptionState() and silently discarded the status. Uses the
    // REAL StoreEventProcessor + EntitlementService + PlayStoreAdapter, same
    // as the renewal test above, so the full pipeline is proven end to end.
    it('a cancelled-then-expired subscription persists a terminal EXPIRED status instead of silently discarding it as a REFUND', async () => {
      const pastExpiresAt = new Date('2026-07-30T09:13:41.000Z');

      const txUserUpdate = jest.fn().mockResolvedValue({});
      const txLedgerUpsert = jest.fn().mockResolvedValue({});
      const entitlementPrisma = {
        $transaction: jest.fn(async (cb: any) =>
          cb({
            $executeRaw: jest.fn().mockResolvedValue(1),
            subscriptionTransaction: { upsert: txLedgerUpsert },
            user: { update: txUserUpdate },
          }),
        ),
      } as unknown as PrismaService;

      const processorPrisma = {
        storeNotification: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 1 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        subscriptionTransaction: {
          findFirst: jest.fn().mockResolvedValue({ userId: 34 }),
        },
      } as unknown as PrismaService;

      const realScanCredit = {
        ...makeScanCreditMock(),
        isCreditProduct: jest.fn().mockReturnValue(false),
        reconcileProGrants: jest.fn().mockResolvedValue(undefined),
        revokePurchase: jest.fn(),
      } as unknown as ScanCreditService;

      const entitlement = new EntitlementService(
        entitlementPrisma,
        realScanCredit,
      );
      const realProcessor = new StoreEventProcessor(
        processorPrisma,
        entitlement,
      );

      const realService = new SubscriptionService(
        prisma as PrismaService,
        configService as ConfigService,
        { track: jest.fn() } as any,
        playVerifier,
        realScanCredit,
        makeAppleAdapterMock(),
        realProcessor,
        makePlayAdapterMock(),
      );

      (prisma.storeNotification.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      (playVerifier.verifyAndAcknowledge as jest.Mock).mockResolvedValue({
        kind: 'subscription',
        productId: 'pro_weekly',
        purchaseToken: 'play-token-renew-1',
        orderId: 'GPA.3349-1234-5678-90123..3',
        active: false,
        acknowledged: true,
        expiresAt: pastExpiresAt,
        startedAt: new Date('2026-07-22T14:07:00.000Z'),
        revoked: true, // expired && cancelledInPast
      });

      const expiredNotification = {
        ...renewalNotification,
        subscriptionNotification: {
          ...renewalNotification.subscriptionNotification,
          notificationType: 13, // SUBSCRIPTION_EXPIRED
        },
      };
      const expiredPayload = {
        message: {
          data: encodeRtdn(expiredNotification),
          messageId: 'rtdn-msg-expired',
          publishTime: '2026-07-30T09:13:44.000Z',
        },
        subscription: 'projects/oneplan/subscriptions/rtdn',
      };

      await realService.handlePlayWebhook(expiredPayload as any);

      // 1. The core bug: the correct terminal status is actually persisted,
      // not silently dropped.
      expect(txUserUpdate).toHaveBeenCalledWith({
        where: { id: 34 },
        data: {
          subscriptionStatus: SubscriptionStatus.EXPIRED,
          subscriptionProductId: 'pro_weekly',
          subscriptionExpiresAt: pastExpiresAt,
          originalTransactionId: 'play-token-renew-1',
        },
      });

      // 2. It went through the SUBSCRIPTION_STATE branch, not REFUND — the
      // ledger row was written via upsertLedger, unlike applyRefund which
      // never touches the ledger.
      expect(txLedgerUpsert).toHaveBeenCalled();

      // 3. Fail-open is preserved: a normal cancellation must never claw
      // back the user's scan credits. Only a genuine refund does that.
      expect(realScanCredit.revokePurchase).not.toHaveBeenCalled();

      expect(processorPrisma.storeNotification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { notificationUUID: 'rtdn-msg-expired' },
          update: expect.objectContaining({
            store: 'GOOGLE',
            userId: 34,
            outcome: 'PROCESSED',
          }),
        }),
      );
    });

    // Companion regression test: the fix must not touch the genuinely
    // distinct refund path. A real Play subscription refund arrives as its
    // own voidedPurchaseNotification RTDN (productType 2 = subs) and is
    // turned into a hardcoded REFUND StoreEvent by
    // createRefundEventFromNotification — never through PlayStoreAdapter's
    // v.revoked-derived classification touched by this fix. It must still
    // revoke credits exactly as before.
    it('a genuine Play subscription refund (voidedPurchaseNotification) still revokes scan credits', async () => {
      const processorPrisma = {
        storeNotification: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 1 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        subscriptionTransaction: {
          findFirst: jest.fn().mockResolvedValue({ userId: 34 }),
        },
      } as unknown as PrismaService;

      const realScanCredit = {
        ...makeScanCreditMock(),
        revokePurchase: jest.fn().mockResolvedValue({
          userId: 34,
          productId: 'pro_weekly',
          grantedAmount: 3,
          clawedBack: 3,
          consumedAtRefund: 0,
          restored: 0,
          applied: true,
        }),
      } as unknown as ScanCreditService;

      const entitlement = new EntitlementService(
        prisma as PrismaService,
        realScanCredit,
      );
      const realProcessor = new StoreEventProcessor(
        processorPrisma,
        entitlement,
      );

      const realService = new SubscriptionService(
        prisma as PrismaService,
        configService as ConfigService,
        { track: jest.fn() } as any,
        playVerifier,
        realScanCredit,
        makeAppleAdapterMock(),
        realProcessor,
        makePlayAdapterMock(),
      );

      (prisma.storeNotification.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      const voidedNotification = {
        version: '1.0',
        packageName: 'com.oneplan.app',
        eventTimeMillis: '1753798400000',
        voidedPurchaseNotification: {
          purchaseToken: 'play-token-refunded-sub',
          orderId: 'GPA.3349-1234-5678-90123..1',
          productType: 2, // subs
          refundType: 1, // user requested
        },
      };
      const voidedPayload = {
        message: {
          data: encodeRtdn(voidedNotification),
          messageId: 'rtdn-msg-voided-sub',
          publishTime: '2026-07-30T09:13:20.000Z',
        },
        subscription: 'projects/oneplan/subscriptions/rtdn',
      };

      await realService.handlePlayWebhook(voidedPayload as any);

      expect(realScanCredit.revokePurchase).toHaveBeenCalledWith(
        'play-token-refunded-sub',
        'play-token-refunded-sub',
      );
      // The verifier is never called for a voided-purchase notification —
      // the token is voided, so Google may 404/return stale data for it.
      expect(playVerifier.verifyAndAcknowledge).not.toHaveBeenCalled();
    });
  });

  describe('environment-aware verifier selection', () => {
    it('initializes verifiers for Auto mode', () => {
      service.onModuleInit();

      expect(SignedDataVerifier).toHaveBeenCalledTimes(2);
      expect(SignedDataVerifier).toHaveBeenNthCalledWith(
        1,
        [
          Buffer.from('mock-cert'),
          Buffer.from('mock-cert'),
          Buffer.from('mock-cert'),
        ],
        true,
        Environment.SANDBOX,
        'com.oneplan.app',
        undefined,
      );
      expect(SignedDataVerifier).toHaveBeenNthCalledWith(
        2,
        [
          Buffer.from('mock-cert'),
          Buffer.from('mock-cert'),
          Buffer.from('mock-cert'),
        ],
        true,
        Environment.PRODUCTION,
        'com.oneplan.app',
        123456789,
      );
    });

    it('selects the Xcode verifier when local testing is configured explicitly', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: string) => {
          const config: Record<string, string> = {
            APP_STORE_BUNDLE_ID: 'com.oneplan.app',
            APP_STORE_APP_APPLE_ID: '123456789',
            APP_STORE_ENVIRONMENT: 'Xcode',
          };
          return config[key] ?? defaultValue;
        },
      );
      service = new SubscriptionService(
        prisma as PrismaService,
        configService as ConfigService,
        { track: jest.fn() } as any,
        playVerifier,
        makeScanCreditMock(),
        makeAppleAdapterMock(),
        processorMock as unknown as StoreEventProcessor,
        makePlayAdapterMock(),
      );
      service.onModuleInit();

      const verifiers = (SignedDataVerifier as jest.Mock).mock.results.map(
        (result) => result.value,
      );
      const xcodeVerifier = verifiers[0];
      xcodeVerifier.verifyAndDecodeTransaction.mockResolvedValue({
        ...mockTransaction,
        environment: Environment.XCODE,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.subscriptionTransaction.create as jest.Mock).mockResolvedValue(
        {},
      );
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionProductId: mockTransaction.productId,
          subscriptionExpiresAt: new Date(mockTransaction.expiresDate),
          autoRenewEnabled: false,
          gracePeriodExpiresAt: null,
        });

      await service.validateTransaction(
        1,
        createUnsignedJws({
          bundleId: 'com.oneplan.app',
          environment: Environment.XCODE,
        }),
      );

      expect(xcodeVerifier.verifyAndDecodeTransaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('selects the sandbox verifier for sandbox notifications', async () => {
      service.onModuleInit();

      const verifiers = (SignedDataVerifier as jest.Mock).mock.results.map(
        (result) => result.value,
      );
      const sandboxVerifier = verifiers[0];
      sandboxVerifier.verifyAndDecodeNotification.mockResolvedValue({
        notificationType: 'TEST',
        notificationUUID: 'uuid-1',
        signedDate: Date.now(),
      });

      await service.handleWebhook(
        createUnsignedJws({
          data: {
            bundleId: 'com.oneplan.app',
            environment: Environment.SANDBOX,
          },
        }),
      );

      expect(sandboxVerifier.verifyAndDecodeNotification).toHaveBeenCalledTimes(
        1,
      );
    });

    it('rejects local testing transactions when Auto mode is enabled', async () => {
      service.onModuleInit();

      await expect(
        service.validateTransaction(
          1,
          createUnsignedJws({
            bundleId: 'com.oneplan.app',
            environment: Environment.XCODE,
          }),
        ),
      ).rejects.toThrow('Unsupported transaction environment');
    });
  });

  describe('logTransaction', () => {
    it('ignores duplicate transaction errors (P2002)', async () => {
      // Initialize verifier first by calling onModuleInit
      await service.onModuleInit();

      // Access private method through updateUserSubscription which calls logTransaction
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.subscriptionTransaction.create as jest.Mock).mockRejectedValue({
        code: 'P2002',
      });

      // Should not throw
      await expect(
        service.updateUserSubscription(1, mockTransaction as any),
      ).resolves.not.toThrow();
    });

    it('rejects (fails closed) when a non-duplicate error occurs logging an Apple transaction', async () => {
      // The ledger write now lives in EntitlementService.upsertLedger (runs
      // inside storeEventProcessor.process), no longer in logTransaction for
      // validateTransaction's credit-purchase flow — use the REAL processor +
      // entitlement to prove fail-closed still holds at the new write site.
      const processorPrisma = {
        storeNotification: {
          findUnique: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 1 }),
          upsert: jest.fn().mockResolvedValue({ id: 1 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        subscriptionTransaction: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaService;

      const entitlementPrisma = {
        $transaction: jest
          .fn()
          .mockRejectedValue(new Error('connection reset')),
      } as unknown as PrismaService;

      const realScanCredit = {
        ...makeScanCreditMock(),
        isCreditProduct: jest.fn().mockReturnValue(true),
      } as unknown as ScanCreditService;

      const entitlement = new EntitlementService(
        entitlementPrisma,
        realScanCredit,
      );
      const realProcessor = new StoreEventProcessor(
        processorPrisma,
        entitlement,
      );

      const realService = new SubscriptionService(
        prisma as PrismaService,
        configService as ConfigService,
        { track: jest.fn() } as any,
        playVerifier,
        realScanCredit,
        makeAppleAdapterMock(),
        realProcessor,
        makePlayAdapterMock(),
      );
      realService.onModuleInit();

      const verifier = (SignedDataVerifier as jest.Mock).mock.results.map(
        (result) => result.value,
      )[0];
      const creditTransaction = {
        ...mockTransaction,
        productId: 'pay_once',
        transactionId: 'txn_payonce_apple',
        originalTransactionId: 'orig_payonce_apple',
      };
      verifier.verifyAndDecodeTransaction.mockResolvedValue(creditTransaction);

      await expect(
        realService.validateTransaction(
          1,
          createUnsignedJws({
            bundleId: 'com.oneplan.app',
            environment: Environment.SANDBOX,
          }),
        ),
      ).rejects.toThrow('connection reset');

      // Fail-closed: the ledger write failed, so the caller must see a
      // failure and retry — not a silent success with no entitlement
      // recorded (Apple has already granted/renewed the purchase).
      expect(realScanCredit.grantPurchase).not.toHaveBeenCalled();
    });
  });
});
