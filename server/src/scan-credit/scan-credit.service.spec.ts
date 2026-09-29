import { ConfigService } from '@nestjs/config';
import { AnalyticsEventName, SubscriptionStatus } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { InsufficientScanCreditsException } from './insufficient-scan-credits.exception';
import { ScanCreditService } from './scan-credit.service';
import { PlayStoreAdapter } from '../subscription/adapters/play-store.adapter';

const USER_ID = 42;
const DAY_MS = 24 * 60 * 60 * 1000;

describe('ScanCreditService', () => {
  let grant: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    createMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    aggregate: jest.Mock;
    count: jest.Mock;
  };
  let consumption: {
    findUnique: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  let user: { findUnique: jest.Mock; updateMany: jest.Mock };
  let subscriptionTransaction: { findMany: jest.Mock };
  let executeRaw: jest.Mock;
  let prisma: PrismaService;
  let config: ConfigService;
  let analyticsMock: { track: jest.Mock };
  let service: ScanCreditService;

  beforeEach(() => {
    grant = {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { remaining: 0 } }),
      count: jest.fn().mockResolvedValue(0),
    };
    consumption = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    };
    user = {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    subscriptionTransaction = { findMany: jest.fn().mockResolvedValue([]) };
    executeRaw = jest.fn().mockResolvedValue(0);

    const db = {
      scanCreditGrant: grant,
      scanCreditConsumption: consumption,
      user,
      subscriptionTransaction,
      $executeRaw: executeRaw,
    };
    prisma = {
      ...db,
      $transaction: jest.fn((cb: (tx: typeof db) => unknown) => cb(db)),
    } as unknown as PrismaService;

    // Env unset → service uses compiled-in defaults (signup 2, weekly 3,
    // monthly 5, yearly 10, pay_once 10).
    config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    analyticsMock = { track: jest.fn() };

    service = new ScanCreditService(
      prisma,
      config,
      analyticsMock as unknown as AnalyticsService,
    );
  });

  type GrantInput = {
    amount: number;
    periodKey: string;
    productId?: string;
    externalRef?: string;
    source?: string;
    remaining?: number;
  };
  const createdGrants = (): GrantInput[] =>
    (grant.createMany.mock.calls[0][0] as { data: GrantInput[] }).data;

  // ── signup bonus ─────────────────────────────────────────────────────────

  it('grants 2 signup-bonus credits inside the caller transaction', async () => {
    const tx = { scanCreditGrant: grant } as never;
    await service.grantSignupBonus(tx, USER_ID);
    expect(grant.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        source: 'signup_bonus',
        amount: 2,
        remaining: 2,
      },
    });
  });

  // ── consume ──────────────────────────────────────────────────────────────

  it('consumes 1 credit from the oldest eligible grant', async () => {
    grant.findFirst.mockResolvedValueOnce({ id: 10 });
    grant.aggregate.mockResolvedValue({ _sum: { remaining: 4 } });

    const bal = await service.consume(USER_ID, 'sess1');

    expect(grant.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { remaining: { decrement: 1 } },
    });
    expect(consumption.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, grantId: 10, sessionId: 'sess1', amount: 1 },
    });
    expect(bal.available).toBe(4);
  });

  it('orders grant selection deterministically (earliest-expiring, then oldest)', async () => {
    grant.findFirst.mockResolvedValueOnce({ id: 7 });
    await service.consume(USER_ID, 'sess_order');

    expect(grant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          remaining: { gt: 0 },
        }),
        orderBy: [
          { expiresAt: { sort: 'asc', nulls: 'last' } },
          { grantedAt: 'asc' },
          { id: 'asc' },
        ],
      }),
    );
  });

  it('rejects the scan with 402 when no credits remain', async () => {
    grant.findFirst.mockResolvedValue(null);
    grant.aggregate.mockResolvedValue({ _sum: { remaining: 0 } });

    await expect(service.consume(USER_ID, 'sess_empty')).rejects.toThrow(
      InsufficientScanCreditsException,
    );
    expect(consumption.create).not.toHaveBeenCalled();
  });

  it('is idempotent — re-consuming the same session does not double-charge', async () => {
    consumption.findUnique.mockResolvedValueOnce({ id: 99 });
    await service.consume(USER_ID, 'sess_dup');
    expect(grant.update).not.toHaveBeenCalled();
    expect(consumption.create).not.toHaveBeenCalled();
  });

  // ── purchases ────────────────────────────────────────────────────────────

  it('adds pack credits for a free user (scan_pack_5 → 5) tagged with the environment', async () => {
    await service.grantPurchase(USER_ID, 'scan_pack_5', 'txn_a', 'Sandbox');
    expect(grant.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        source: 'purchase',
        productId: 'scan_pack_5',
        amount: 5,
        remaining: 5,
        externalRef: 'txn_a',
        environment: 'Sandbox',
      },
    });
  });

  it('tags a purchase with environment=null when none is provided', async () => {
    await service.grantPurchase(USER_ID, 'scan_pack_5', 'txn_a');
    expect(grant.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        source: 'purchase',
        productId: 'scan_pack_5',
        amount: 5,
        remaining: 5,
        externalRef: 'txn_a',
        environment: null,
      },
    });
  });

  it('adds pack credits for a Pro user (scan_pack_15 → 15) and maps pay_once → 10', async () => {
    await service.grantPurchase(USER_ID, 'scan_pack_15', 'txn_b');
    expect(grant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 15, source: 'purchase' }),
      }),
    );

    grant.create.mockClear();
    await service.grantPurchase(USER_ID, 'pay_once', 'txn_c');
    expect(grant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 10,
          source: 'pay_once',
          externalRef: 'txn_c',
        }),
      }),
    );
  });

  it('does not double-grant a purchase already recorded for the transaction', async () => {
    grant.findFirst.mockResolvedValueOnce({ id: 1 });
    await service.grantPurchase(USER_ID, 'scan_pack_30', 'txn_dup');
    expect(grant.create).not.toHaveBeenCalled();
  });

  it('ignores non-credit products', async () => {
    await service.grantPurchase(USER_ID, 'pro_monthly', 'txn_sub');
    expect(grant.create).not.toHaveBeenCalled();
  });

  // ── Pro per-billing-cycle reconciliation ─────────────────────────────────

  // Pro grants are one per Apple SubscriptionTransaction (initial + each
  // renewal), keyed periodKey=transactionId, idempotent via the have-set +
  // partial unique index. No cutover (app still pre-launch — no backfill
  // concern).
  function mockProTxns(opts: {
    txns: Array<{
      transactionId?: string;
      productId: string;
      revocationDate?: Date | null;
      environment?: string | null;
    }>;
    status?: SubscriptionStatus;
    expiresAt?: Date | null;
    originalTransactionId?: string | null;
  }): void {
    user.findUnique.mockResolvedValue({
      subscriptionStatus: opts.status ?? SubscriptionStatus.ACTIVE,
      subscriptionExpiresAt:
        opts.expiresAt === undefined
          ? new Date(Date.now() + 365 * DAY_MS)
          : opts.expiresAt,
      originalTransactionId:
        opts.originalTransactionId === undefined
          ? 'OT1'
          : opts.originalTransactionId,
    });
    subscriptionTransaction.findMany.mockResolvedValue(
      opts.txns.map((t, i) => ({
        transactionId: t.transactionId ?? `TXN${i}`,
        productId: t.productId,
        revocationDate: t.revocationDate ?? null,
        environment: t.environment ?? 'Production',
      })),
    );
  }

  it.each([
    ['pro_weekly', 3],
    ['pro_monthly', 20],
    ['pro_yearly', 300],
  ])(
    'grants the full %s cycle amount (%d) on the first purchase',
    async (sku, amount) => {
      mockProTxns({ txns: [{ transactionId: 'T0', productId: sku }] });

      await service.reconcileProGrants(USER_ID);

      expect(grant.createMany).toHaveBeenCalledTimes(1);
      const data = createdGrants();
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({
        userId: USER_ID,
        source: 'pro_weekly_grant',
        productId: sku,
        amount,
        remaining: amount,
        externalRef: 'OT1',
        periodKey: 'T0',
        environment: 'Production',
      });
    },
  );

  it('copies the SubscriptionTransaction environment onto the Pro grant (Sandbox)', async () => {
    mockProTxns({
      txns: [
        {
          transactionId: 'T0',
          productId: 'pro_weekly',
          environment: 'Sandbox',
        },
      ],
    });

    await service.reconcileProGrants(USER_ID);

    const data = createdGrants();
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual(
      expect.objectContaining({ environment: 'Sandbox', periodKey: 'T0' }),
    );
  });

  it('grants one row per Apple transaction (initial + each renewal)', async () => {
    mockProTxns({
      txns: [
        { transactionId: 'T0', productId: 'pro_monthly' },
        { transactionId: 'T1', productId: 'pro_monthly' },
      ],
    });

    await service.reconcileProGrants(USER_ID);

    const data = createdGrants();
    expect(data).toHaveLength(2);
    expect(data.map((g) => g.periodKey)).toEqual(['T0', 'T1']);
    expect(data.every((g) => g.amount === 20 && g.externalRef === 'OT1')).toBe(
      true,
    );
  });

  // Regression guard for P2000: Google Play's renewalTransactionId (the
  // periodKey source) is a 144-char purchase token, not Apple's short
  // numeric transactionId. period_key must accept it unmodified — schema.
  // prisma's VARCHAR(64) truncated the real column, widened to VARCHAR(255)
  // to match external_ref.
  it('passes a 144-char Google Play purchase token through as periodKey unmodified', async () => {
    const playPurchaseToken = 'g'.repeat(144);
    mockProTxns({
      txns: [{ transactionId: playPurchaseToken, productId: 'pro_weekly' }],
    });

    await service.reconcileProGrants(USER_ID);

    const data = createdGrants();
    expect(data).toHaveLength(1);
    expect(data[0].periodKey).toBe(playPurchaseToken);
    expect(data[0].periodKey).toHaveLength(144);
  });

  // End-to-end proof of the periodKey fix, through the REAL PlayStoreAdapter:
  // Google keeps purchaseToken constant across renewals, so a Play Pro
  // subscriber's cycles must be keyed by the per-cycle orderId, not the
  // token, or every renewal collapses onto the same SubscriptionTransaction
  // row and periodKey never advances (the bug this branch fixes).
  describe('Google Play periodKey (orderId-keyed, via PlayStoreAdapter)', () => {
    const playAdapter = new PlayStoreAdapter({} as ConfigService);
    const purchaseToken = 'g'.repeat(144);

    const cycleTxn = (orderId: string) =>
      playAdapter.toStoreEvent({
        verified: {
          kind: 'subscription',
          productId: 'pro_weekly',
          purchaseToken,
          orderId,
          expiresAt: new Date('2026-08-01T00:00:00.000Z'),
          startedAt: new Date('2026-07-25T00:00:00.000Z'),
          revoked: false,
        },
        source: 'NOTIFICATION',
        status: SubscriptionStatus.ACTIVE,
        isCreditProduct: false,
        eventId: orderId,
      });

    it('1 purchase + 3 renewals => 4 grants, all sharing lineId as externalRef', async () => {
      const cycles = [
        'GPA.3349-1234-5678-90123..0',
        'GPA.3349-1234-5678-90123..1',
        'GPA.3349-1234-5678-90123..2',
        'GPA.3349-1234-5678-90123..3',
      ].map(cycleTxn);

      // Sanity: the adapter really produced 4 distinct SubscriptionTransaction
      // keys sharing one lineId (purchaseToken) — the precondition for
      // reconcileWithTx to see 4 rows in the first place.
      expect(new Set(cycles.map((e) => e.transactionId)).size).toBe(4);
      expect(cycles.every((e) => e.lineId === purchaseToken)).toBe(true);

      mockProTxns({
        originalTransactionId: purchaseToken,
        txns: cycles.map((e) => ({
          transactionId: e.transactionId,
          productId: 'pro_weekly',
        })),
      });

      await service.reconcileProGrants(USER_ID);

      const data = createdGrants();
      expect(data).toHaveLength(4);
      expect(data.every((g) => g.externalRef === purchaseToken)).toBe(true);
      expect(new Set(data.map((g) => g.periodKey)).size).toBe(4);
    });

    it('replaying the same renewal notification twice still yields exactly one grant for that cycle', async () => {
      const first = cycleTxn('GPA.3349-1234-5678-90123..1');
      const redelivered = cycleTxn('GPA.3349-1234-5678-90123..1');
      expect(first.transactionId).toBe(redelivered.transactionId);

      mockProTxns({
        originalTransactionId: purchaseToken,
        txns: [{ transactionId: first.transactionId, productId: 'pro_weekly' }],
      });
      // Simulates the FIRST delivery having already been reconciled.
      grant.findMany.mockResolvedValueOnce([
        { periodKey: first.transactionId },
      ]);

      await service.reconcileProGrants(USER_ID);

      expect(grant.createMany).not.toHaveBeenCalled();
    });
  });

  it('is idempotent — skips transactions already granted', async () => {
    mockProTxns({
      txns: [
        { transactionId: 'T0', productId: 'pro_monthly' },
        { transactionId: 'T1', productId: 'pro_monthly' },
      ],
    });
    grant.findMany.mockResolvedValueOnce([{ periodKey: 'T0' }]);

    await service.reconcileProGrants(USER_ID);

    const data = createdGrants();
    expect(data).toHaveLength(1);
    expect(data[0].periodKey).toBe('T1');
  });

  it('skips a revoked/refunded renewal transaction', async () => {
    mockProTxns({
      txns: [
        { transactionId: 'T0', productId: 'pro_monthly' },
        {
          transactionId: 'T1',
          productId: 'pro_monthly',
          revocationDate: new Date('2026-06-05T00:00:00Z'),
        },
      ],
    });

    await service.reconcileProGrants(USER_ID);
    const data = createdGrants();
    expect(data).toHaveLength(1);
    expect(data[0].periodKey).toBe('T0');
  });

  it('does not reconcile without an originalTransactionId', async () => {
    user.findUnique.mockResolvedValue({
      subscriptionStatus: SubscriptionStatus.NONE,
      subscriptionExpiresAt: null,
      originalTransactionId: null,
    });
    await service.reconcileProGrants(USER_ID);
    expect(grant.createMany).not.toHaveBeenCalled();
  });

  it('does not reconcile when there are no Pro transactions', async () => {
    mockProTxns({ txns: [] });
    await service.reconcileProGrants(USER_ID);
    expect(grant.createMany).not.toHaveBeenCalled();
  });

  it('nextProGrantAt = subscription expiry while active, else null', async () => {
    const expiresAt = new Date(Date.now() + 30 * DAY_MS);
    mockProTxns({
      txns: [{ transactionId: 'T0', productId: 'pro_monthly' }],
      expiresAt,
    });
    const active = await service.getBalance(USER_ID);
    expect(active.nextProGrantAt).toEqual(expiresAt);

    mockProTxns({
      txns: [{ transactionId: 'T0', productId: 'pro_monthly' }],
      status: SubscriptionStatus.EXPIRED,
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    const ended = await service.getBalance(USER_ID);
    expect(ended.nextProGrantAt).toBeNull();
  });

  it('stale ACTIVE (past expiresAt, no RTDN ever flipped it) -> nextProGrantAt is null (the device bug)', async () => {
    // Reproduces the on-device bug: a Google Play sub lapsed, nothing ever
    // transitioned subscriptionStatus off ACTIVE, and computeProSchedule used
    // to trust that stored status directly — surfacing a stale renewal date
    // in the out-of-credits sheet ("adds more on Thursday July 9", two weeks
    // in the past). Must be collapsed via the same guard subscription.service
    // uses, not computed independently.
    mockProTxns({
      txns: [{ transactionId: 'T0', productId: 'pro_monthly' }],
      status: SubscriptionStatus.ACTIVE,
      expiresAt: new Date(Date.now() - 14 * DAY_MS),
    });

    const bal = await service.getBalance(USER_ID);

    expect(bal.nextProGrantAt).toBeNull();
  });

  it('BILLING_RETRY still surfaces nextProGrantAt (Apple keeps retrying the charge, so a renewal can still land)', async () => {
    // Regression guard: a prior local ACTIVE_PAID_STATUSES copy omitted
    // BILLING_RETRY, hiding the next-grant date for a user the rest of the
    // app (subscription.service resolveTier, auth/friends isPro) already
    // treats as Pro. Must route through the shared isEntitledToPro predicate.
    const expiresAt = new Date(Date.now() - 2 * DAY_MS);
    mockProTxns({
      txns: [{ transactionId: 'T0', productId: 'pro_monthly' }],
      status: SubscriptionStatus.BILLING_RETRY,
      expiresAt,
    });

    const bal = await service.getBalance(USER_ID);

    expect(bal.nextProGrantAt).toEqual(expiresAt);
  });

  it('honors the SCAN_GRANT_PRO_* env override as a per-cycle amount', async () => {
    const cfg = {
      get: jest.fn((key: string) =>
        key === 'SCAN_GRANT_PRO_MONTHLY' ? 7 : undefined,
      ),
    } as unknown as ConfigService;
    const custom = new ScanCreditService(
      prisma,
      cfg,
      analyticsMock as unknown as AnalyticsService,
    );
    mockProTxns({ txns: [{ transactionId: 'T0', productId: 'pro_monthly' }] });

    await custom.reconcileProGrants(USER_ID);
    expect(createdGrants()[0].amount).toBe(7);
  });

  // ── balance ──────────────────────────────────────────────────────────────

  it('sums remaining across all grants into one available balance', async () => {
    grant.aggregate.mockResolvedValue({ _sum: { remaining: 17 } });
    const bal = await service.getBalance(USER_ID);
    expect(bal.available).toBe(17);
    expect(bal.nextProGrantAt).toBeNull();
  });

  it('honors (but does not require) the nullable expiresAt in the balance query', async () => {
    await service.getBalance(USER_ID);
    expect(grant.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          remaining: { gt: 0 },
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      }),
    );
  });

  it('keeps unused Pro-granted credits after the subscription ends', async () => {
    // Expired sub, but old grant rows still carry remaining → still spendable.
    user.findUnique.mockResolvedValue({
      subscriptionStatus: SubscriptionStatus.EXPIRED,
      subscriptionProductId: 'pro_monthly',
      subscriptionExpiresAt: new Date(Date.now() - 5 * DAY_MS),
      originalTransactionId: 'OT1',
    });
    subscriptionTransaction.findMany.mockResolvedValue([
      {
        purchaseDate: new Date(Date.now() - 40 * DAY_MS),
        revocationDate: null,
        productId: 'pro_monthly',
      },
    ]);
    grant.aggregate.mockResolvedValue({ _sum: { remaining: 15 } });

    const bal = await service.getBalance(USER_ID);
    expect(bal.available).toBe(15);
    // Sub ended → no future grant scheduled.
    expect(bal.nextProGrantAt).toBeNull();
  });

  // ── refund ───────────────────────────────────────────────────────────────

  it('refund restores 1 credit to the originating grant and is idempotent', async () => {
    consumption.findUnique
      .mockResolvedValueOnce({ userId: USER_ID, grantId: 10, refundedAt: null })
      .mockResolvedValueOnce({
        userId: USER_ID,
        grantId: 10,
        refundedAt: new Date(),
      });

    await service.refund('sess_r');
    await service.refund('sess_r');

    expect(grant.updateMany).toHaveBeenCalledTimes(1);
    expect(grant.updateMany).toHaveBeenCalledWith({
      where: { id: 10, revokedAt: null },
      data: { remaining: { increment: 1 } },
    });
  });

  it('refund is a no-op for a session that never consumed (cache hit)', async () => {
    consumption.findUnique.mockResolvedValue(null);
    await service.refund('sess_never');
    expect(grant.updateMany).not.toHaveBeenCalled();
  });

  it('refund does not resurrect a revoked grant (guard no-ops)', async () => {
    consumption.findUnique.mockResolvedValueOnce({
      userId: USER_ID,
      grantId: 10,
      refundedAt: null,
    });
    grant.updateMany.mockResolvedValueOnce({ count: 0 }); // revokedAt guard misses

    await service.refund('sess_revoked');

    // Consumption still marked refunded (audit), grant increment no-ops.
    expect(consumption.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'sess_revoked', refundedAt: null },
      data: { refundedAt: expect.any(Date) },
    });
    expect(grant.updateMany).toHaveBeenCalledWith({
      where: { id: 10, revokedAt: null },
      data: { remaining: { increment: 1 } },
    });
  });

  // ── refund clawback (Apple REFUND / REVOKE / REFUND_REVERSED) ────────────

  it('revokePurchase zeros remaining + returns clawback metrics', async () => {
    grant.findFirst.mockResolvedValueOnce({
      id: 10,
      userId: USER_ID,
      amount: 15,
      productId: 'scan_pack_15',
    });
    // In-lock read: 5 unused remained → clawedBack 5, consumed 10.
    grant.findUnique.mockResolvedValueOnce({
      remaining: 5,
      revokedAt: null,
      amount: 15,
    });

    const res = await service.revokePurchase('OTX', 'TX');

    expect(res).toEqual({
      userId: USER_ID,
      productId: 'scan_pack_15',
      grantedAmount: 15,
      clawedBack: 5,
      consumedAtRefund: 10,
      restored: 0,
      applied: true,
    });
    expect(grant.findFirst).toHaveBeenCalledWith({
      where: {
        externalRef: { in: ['OTX', 'TX'] },
        source: { in: ['purchase', 'pay_once'] },
      },
      select: { id: true, userId: true, amount: true, productId: true },
    });
    expect(grant.updateMany).toHaveBeenCalledWith({
      where: { id: 10, revokedAt: null },
      data: { remaining: 0, revokedAt: expect.any(Date) },
    });
  });

  it('revokePurchase is idempotent (applied=false on replay) and matches by either Apple id', async () => {
    grant.findFirst.mockResolvedValue({
      id: 7,
      userId: USER_ID,
      amount: 5,
      productId: 'scan_pack_5',
    });
    grant.findUnique
      .mockResolvedValueOnce({ remaining: 5, revokedAt: null, amount: 5 })
      .mockResolvedValueOnce({
        remaining: 0,
        revokedAt: new Date(),
        amount: 5,
      });

    const a = await service.revokePurchase('', 'TXN_ONLY');
    const b = await service.revokePurchase('', 'TXN_ONLY');

    expect(a.applied).toBe(true);
    expect(a.clawedBack).toBe(5);
    expect(b.applied).toBe(false); // already revoked
    expect(b.clawedBack).toBe(0);
    // Falsy originalTransactionId filtered out of the id-set.
    expect(grant.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalRef: { in: ['TXN_ONLY'] },
        }),
      }),
    );
  });

  it('revokePurchase returns null for an unknown transaction', async () => {
    grant.findFirst.mockResolvedValueOnce(null);
    const res = await service.revokePurchase('OTX', 'TX');
    expect(res).toBeNull();
    expect(grant.updateMany).not.toHaveBeenCalled();
  });

  it('restorePurchase recomputes remaining = amount − still-consumed', async () => {
    grant.findFirst.mockResolvedValueOnce({
      id: 10,
      userId: USER_ID,
      amount: 15,
      productId: 'scan_pack_15',
    });
    grant.findUnique.mockResolvedValueOnce({
      revokedAt: new Date(),
      amount: 15,
    });
    consumption.count.mockResolvedValueOnce(10);

    const res = await service.restorePurchase('OTX', 'TX');

    expect(res).toEqual({
      userId: USER_ID,
      productId: 'scan_pack_15',
      grantedAmount: 15,
      clawedBack: 0,
      consumedAtRefund: 10,
      restored: 5,
      applied: true,
    });
    expect(consumption.count).toHaveBeenCalledWith({
      where: { grantId: 10, refundedAt: null },
    });
    expect(grant.updateMany).toHaveBeenCalledWith({
      where: { id: 10, revokedAt: { not: null } },
      data: { remaining: 5, revokedAt: null },
    });
  });

  it('restorePurchase is a no-op (applied=false) when the grant is not revoked', async () => {
    grant.findFirst.mockResolvedValueOnce({
      id: 10,
      userId: USER_ID,
      amount: 15,
      productId: 'scan_pack_15',
    });
    grant.findUnique.mockResolvedValueOnce({ revokedAt: null, amount: 15 });

    const res = await service.restorePurchase('OTX', 'TX');
    expect(res?.applied).toBe(false);
  });

  it('restorePurchase returns null for an unknown transaction', async () => {
    grant.findFirst.mockResolvedValueOnce(null);
    const res = await service.restorePurchase('OTX', 'TX');
    expect(res).toBeNull();
    expect(grant.updateMany).not.toHaveBeenCalled();
  });

  it('peekPurchaseGrant returns the snapshot or null', async () => {
    grant.findFirst.mockResolvedValueOnce({
      id: 9,
      userId: USER_ID,
      amount: 30,
      productId: 'scan_pack_30',
    });
    grant.findUnique.mockResolvedValueOnce({ remaining: 12 });

    const snap = await service.peekPurchaseGrant('OTX', 'TX');
    expect(snap).toEqual({
      userId: USER_ID,
      productId: 'scan_pack_30',
      grantedAmount: 30,
      remaining: 12,
    });

    grant.findFirst.mockResolvedValueOnce(null);
    expect(await service.peekPurchaseGrant('OTX', 'TX')).toBeNull();
  });

  it('balance + consume exclude revoked grants', async () => {
    await service.getBalance(USER_ID);
    expect(grant.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );

    grant.findFirst.mockResolvedValueOnce({ id: 1 });
    await service.consume(USER_ID, 'sess_x');
    const consumeWhere = grant.findFirst.mock.calls.at(-1)?.[0] as {
      where: Record<string, unknown>;
    };
    expect(consumeWhere.where).toEqual(
      expect.objectContaining({ revokedAt: null }),
    );
  });

  // ── inflow analytics ─────────────────────────────────────────────────────

  it('grantPurchase emits SCAN_PACK_PURCHASED once on a real create', async () => {
    await service.grantPurchase(USER_ID, 'scan_pack_5', 'txn_a');
    expect(analyticsMock.track).toHaveBeenCalledTimes(1);
    expect(analyticsMock.track).toHaveBeenCalledWith(
      AnalyticsEventName.SCAN_PACK_PURCHASED,
      {
        userId: USER_ID,
        properties: {
          source: 'purchase',
          productId: 'scan_pack_5',
          amount: 5,
          transactionId: 'txn_a',
        },
      },
    );
  });

  it('grantPurchase tags pay_once with source pay_once', async () => {
    await service.grantPurchase(USER_ID, 'pay_once', 'txn_c');
    expect(analyticsMock.track).toHaveBeenCalledWith(
      AnalyticsEventName.SCAN_PACK_PURCHASED,
      {
        userId: USER_ID,
        properties: {
          source: 'pay_once',
          productId: 'pay_once',
          amount: 10,
          transactionId: 'txn_c',
        },
      },
    );
  });

  it('grantPurchase does NOT emit on an idempotent replay', async () => {
    grant.findFirst.mockResolvedValueOnce({ id: 1 });
    await service.grantPurchase(USER_ID, 'scan_pack_30', 'txn_dup');
    expect(analyticsMock.track).not.toHaveBeenCalled();
  });

  it('grantPurchase does NOT emit for a non-credit product', async () => {
    await service.grantPurchase(USER_ID, 'pro_monthly', 'txn_sub');
    expect(analyticsMock.track).not.toHaveBeenCalled();
  });

  it('reconcileProGrants emits SCAN_CREDITS_GRANTED with summed cycle credits', async () => {
    // Initial + renewal on different plans → 2 grants, mixed amounts.
    mockProTxns({
      txns: [
        { transactionId: 'T0', productId: 'pro_monthly' },
        { transactionId: 'T1', productId: 'pro_yearly' },
      ],
    });
    grant.createMany.mockResolvedValueOnce({ count: 2 });

    await service.reconcileProGrants(USER_ID);

    expect(analyticsMock.track).toHaveBeenCalledWith(
      AnalyticsEventName.SCAN_CREDITS_GRANTED,
      {
        userId: USER_ID,
        properties: {
          source: 'pro_weekly_grant',
          productId: 'pro_yearly', // SKU of the most recent created grant
          amount: 20 + 300, // summed across the cycles granted
          periods: 2,
        },
      },
    );
  });

  it("consume()'s safety-net reconcile also emits SCAN_CREDITS_GRANTED", async () => {
    mockProTxns({ txns: [{ transactionId: 'T0', productId: 'pro_monthly' }] });
    grant.createMany.mockResolvedValueOnce({ count: 1 });
    grant.findFirst.mockResolvedValueOnce({ id: 5 }); // an eligible grant to spend

    await service.consume(USER_ID, 'sess_pro');

    expect(analyticsMock.track).toHaveBeenCalledWith(
      AnalyticsEventName.SCAN_CREDITS_GRANTED,
      {
        userId: USER_ID,
        properties: {
          source: 'pro_weekly_grant',
          productId: 'pro_monthly',
          amount: 20,
          periods: 1,
        },
      },
    );
  });

  it('does NOT emit a pro grant when no rows were inserted', async () => {
    mockProTxns({
      txns: [{ transactionId: 'T0', productId: 'pro_monthly' }],
    });
    grant.findMany.mockResolvedValueOnce([{ periodKey: 'T0' }]); // already granted

    await service.reconcileProGrants(USER_ID);
    expect(analyticsMock.track).not.toHaveBeenCalledWith(
      AnalyticsEventName.SCAN_CREDITS_GRANTED,
      expect.anything(),
    );
  });

  it('adminAdjust emits SCAN_CREDITS_GRANTED; a non-positive adjust does not', async () => {
    await service.adminAdjust(USER_ID, 5, 'note');
    expect(analyticsMock.track).toHaveBeenCalledWith(
      AnalyticsEventName.SCAN_CREDITS_GRANTED,
      {
        userId: USER_ID,
        properties: { source: 'admin_adjustment', amount: 5, note: 'note' },
      },
    );

    analyticsMock.track.mockClear();
    await service.adminAdjust(USER_ID, 0);
    expect(analyticsMock.track).not.toHaveBeenCalled();
  });

  // ── env overrides ────────────────────────────────────────────────────────

  it('honors env overrides for grant amounts', async () => {
    const cfg = {
      get: jest.fn((key: string) => {
        const o: Record<string, number> = {
          SIGNUP_BONUS_SCAN_CREDITS: 9,
          SCAN_GRANT_PRO_WEEKLY: 1,
        };
        return o[key];
      }),
    } as unknown as ConfigService;
    const custom = new ScanCreditService(
      prisma,
      cfg,
      analyticsMock as unknown as AnalyticsService,
    );

    const tx = { scanCreditGrant: grant } as never;
    await custom.grantSignupBonus(tx, USER_ID);
    expect(grant.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        source: 'signup_bonus',
        amount: 9,
        remaining: 9,
      },
    });
  });

  // ── app-update reward (grantAppUpgrade) ──────────────────────────────────

  it('grants 5 app-upgrade credits on the first report of a version >= floor', async () => {
    await service.grantAppUpgrade(USER_ID, '1.2.5');

    expect(grant.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        source: 'app_upgrade',
        productId: '1.2.5',
        amount: 5,
        remaining: 5,
        externalRef: '1.2.5',
      },
    });
    expect(analyticsMock.track).toHaveBeenCalledWith(
      AnalyticsEventName.SCAN_CREDITS_GRANTED,
      {
        userId: USER_ID,
        properties: { source: 'app_upgrade', amount: 5, version: '1.2.5' },
      },
    );
  });

  it('is idempotent — a second report of the same version does not re-grant', async () => {
    grant.findFirst.mockResolvedValueOnce({ id: 99 });

    await service.grantAppUpgrade(USER_ID, '1.2.5');

    expect(grant.create).not.toHaveBeenCalled();
    expect(analyticsMock.track).not.toHaveBeenCalled();
  });

  it('does not grant for a version below the floor', async () => {
    await service.grantAppUpgrade(USER_ID, '1.0.6');

    expect(grant.create).not.toHaveBeenCalled();
    expect(analyticsMock.track).not.toHaveBeenCalled();
  });

  it('grants again for a newer version (idempotency is per exact version)', async () => {
    await service.grantAppUpgrade(USER_ID, '1.3.0');

    expect(grant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'app_upgrade',
          externalRef: '1.3.0',
          amount: 5,
        }),
      }),
    );
  });

  it('treats "1.2" as "1.2.0" (below 1.2.5) but "1.3" as eligible', async () => {
    await service.grantAppUpgrade(USER_ID, '1.2');
    expect(grant.create).not.toHaveBeenCalled();

    await service.grantAppUpgrade(USER_ID, '1.3');
    expect(grant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ externalRef: '1.3' }),
      }),
    );
  });

  it('no-ops on a malformed version string', async () => {
    await service.grantAppUpgrade(USER_ID, 'not-a-version');

    expect(grant.create).not.toHaveBeenCalled();
    expect(analyticsMock.track).not.toHaveBeenCalled();
  });

  it('does not grant when the promotion is paused via env', async () => {
    const cfg = {
      get: jest.fn((key: string) =>
        key === 'SCAN_GRANT_APP_UPGRADE_ENABLED' ? 'false' : undefined,
      ),
    } as unknown as ConfigService;
    const paused = new ScanCreditService(
      prisma,
      cfg,
      analyticsMock as unknown as AnalyticsService,
    );

    await paused.grantAppUpgrade(USER_ID, '1.2.5');

    expect(grant.create).not.toHaveBeenCalled();
    expect(analyticsMock.track).not.toHaveBeenCalled();
  });

  // ── rewarded-ad reward (grantRewardedAd) ─────────────────────────────────

  it('grants 1 rewarded-ad credit and reports remainingToday', async () => {
    const res = await service.grantRewardedAd(USER_ID, 'ad-key-1');

    expect(res).toEqual({ granted: true, remainingToday: 2 });
    expect(grant.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        source: 'rewarded_ad',
        amount: 1,
        remaining: 1,
        externalRef: 'ad-key-1',
      },
    });
    expect(analyticsMock.track).toHaveBeenCalledWith(
      AnalyticsEventName.SCAN_CREDITS_GRANTED,
      {
        userId: USER_ID,
        properties: { source: 'rewarded_ad', amount: 1 },
      },
    );
  });

  it('is idempotent — replaying an adKey reports granted without creating or emitting', async () => {
    grant.count.mockResolvedValueOnce(1);
    grant.findFirst.mockResolvedValueOnce({ id: 7 });

    const res = await service.grantRewardedAd(USER_ID, 'ad-key-1');

    expect(res).toEqual({ granted: true, remainingToday: 2 });
    expect(grant.create).not.toHaveBeenCalled();
    expect(analyticsMock.track).not.toHaveBeenCalled();
  });

  it('rejects the 4th grant of the day', async () => {
    grant.count.mockResolvedValueOnce(3);

    const res = await service.grantRewardedAd(USER_ID, 'ad-key-4');

    expect(res).toEqual({ granted: false, remainingToday: 0 });
    expect(grant.create).not.toHaveBeenCalled();
    expect(analyticsMock.track).not.toHaveBeenCalled();
  });

  it('counts only rewarded_ad grants from the start of the UTC day', async () => {
    await service.grantRewardedAd(USER_ID, 'ad-key-2');

    const [countArgs] = grant.count.mock.calls[0] as [
      { where: { source: string; grantedAt: { gte: Date } } },
    ];
    const where = countArgs.where;
    expect(where.source).toBe('rewarded_ad');
    const gte = where.grantedAt.gte;
    expect(gte.getUTCHours()).toBe(0);
    expect(gte.getUTCMinutes()).toBe(0);
    expect(gte.getUTCSeconds()).toBe(0);
  });
});
