import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsEventName, Prisma } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { InsufficientScanCreditsException } from './insufficient-scan-credits.exception';
import { isEntitledToPro } from '../common/subscription-status.util';

export type ScanCreditSource =
  | 'signup_bonus'
  | 'pro_weekly_grant'
  | 'purchase'
  | 'pay_once'
  | 'admin_adjustment'
  | 'app_upgrade'
  | 'rewarded_ad'
  | 'mission_reward';

export interface ScanCreditBalance {
  available: number;
  nextProGrantAt: Date | null;
}

// Returned by revokePurchase/restorePurchase for refund analytics. `applied`
// is false on an idempotent replay (already revoked / not revoked) — callers
// must not emit a duplicate analytics event in that case.
export interface RefundResult {
  userId: number;
  productId: string | null;
  grantedAmount: number;
  clawedBack: number;
  consumedAtRefund: number;
  restored: number;
  applied: boolean;
}

// Returned by reconcileWithTx so BOTH callers (public reconcileProGrants and
// consume()'s safety-net reconcile) can emit a SCAN_CREDITS_GRANTED analytics
// event AFTER their transaction commits — only when `created > 0` (idempotent:
// later createMany calls insert 0 rows). `totalCredits` is the summed amount
// across the rows just created (per-renewal amounts can differ across plan
// switches); `proSku` is the SKU of the most recent created grant.
interface ProReconcileResult {
  created: number;
  totalCredits: number;
  proSku: string | null;
}

// Auto-renewable Pro SKUs. Each drives a full per-billing-cycle credit grant.
const PRO_SKUS = ['pro_weekly', 'pro_monthly', 'pro_yearly'] as const;
type ProSku = (typeof PRO_SKUS)[number];

const PAY_ONCE_SKU = 'pay_once';

// Rewarded-ad reward: fixed +1 per completed ad view, hard-capped per UTC day.
// The cap mirrors the "Max 3/day" copy on the iOS free-ad card.
const REWARDED_AD_AMOUNT = 1;
const REWARDED_AD_DAILY_CAP = 3;

// Consumable scan-credit packs. The credit amount is fixed by the product
// itself, so it's a constant map (not env-tunable) — changing it would mean a
// different App Store product anyway.
const PACK_CREDITS: Record<string, number> = {
  'oneplan.video_scan_1': 1,
  'oneplan.video_scan_5': 5,
  'oneplan.video_scan_15': 15,
  'oneplan.video_scan_30': 30,
  // Legacy/local aliases kept so older StoreKit config transactions and tests
  // remain valid while production uses the App Store Connect IDs above.
  scan_pack_1: 1,
  scan_pack_5: 5,
  scan_pack_15: 15,
  scan_pack_30: 30,
};

// Credits granted in full per billing cycle (upfront + each renewal). The
// _PRO_WEEKLY/_MONTHLY/_YEARLY suffix names the Pro SKU, not a cadence.
const PRO_CYCLE_ENV: Record<ProSku, string> = {
  pro_weekly: 'SCAN_GRANT_PRO_WEEKLY',
  pro_monthly: 'SCAN_GRANT_PRO_MONTHLY',
  pro_yearly: 'SCAN_GRANT_PRO_YEARLY',
};
const PRO_CYCLE_DEFAULT: Record<ProSku, number> = {
  pro_weekly: 3,
  pro_monthly: 20,
  pro_yearly: 300,
};

interface ProTxn {
  transactionId: string;
  productId: string;
  revocationDate: Date | null;
  environment: string | null;
}

interface ProSchedule {
  originalTransactionId: string;
  // Every Pro SubscriptionTransaction for the active subscription, oldest
  // first (one per initial purchase + each auto-renewal).
  txns: ProTxn[];
  // When the next billing cycle's credits arrive (= subscription renewal /
  // expiry) while active, else null.
  nextProGrantAt: Date | null;
}

// Any client that can run the Prisma queries we need — the real client or a
// transaction client. Keeps reconcile usable both standalone and inside an
// already-locked consume() transaction without nesting $transaction.
type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ScanCreditService {
  private readonly logger = new Logger(ScanCreditService.name);
  private readonly signupBonus: number;
  private readonly payOnceAmount: number;
  private readonly proCycleAmounts: Record<ProSku, number>;
  private readonly appUpgradeAmount: number;
  private readonly appUpgradeEnabled: boolean;
  private readonly appUpgradeMinVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly analytics: AnalyticsService,
  ) {
    this.signupBonus = this.resolveEnv('SIGNUP_BONUS_SCAN_CREDITS', 2);
    this.payOnceAmount = this.resolveEnv('SCAN_GRANT_PAY_ONCE', 10);
    this.appUpgradeAmount = this.resolveEnv('SCAN_GRANT_APP_UPGRADE', 5);
    // Pause switch. Env is a string ('true'/'false') validated by Joi; reading
    // `!== 'false'` keeps the default-enabled contract — see app.module.ts.
    this.appUpgradeEnabled =
      this.config.get<string>('SCAN_GRANT_APP_UPGRADE_ENABLED') !== 'false';
    this.appUpgradeMinVersion =
      this.config.get<string>('SCAN_GRANT_APP_UPGRADE_MIN_VERSION') ?? '1.2.5';
    this.proCycleAmounts = {
      pro_weekly: this.resolveEnv(
        PRO_CYCLE_ENV.pro_weekly,
        PRO_CYCLE_DEFAULT.pro_weekly,
      ),
      pro_monthly: this.resolveEnv(
        PRO_CYCLE_ENV.pro_monthly,
        PRO_CYCLE_DEFAULT.pro_monthly,
      ),
      pro_yearly: this.resolveEnv(
        PRO_CYCLE_ENV.pro_yearly,
        PRO_CYCLE_DEFAULT.pro_yearly,
      ),
    };
  }

  private resolveEnv(key: string, fallback: number): number {
    const v = this.config.get<number>(key);
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
  }

  // Exposes the constructor-resolved signup-bonus amount so auth.service can
  // emit SCAN_CREDITS_GRANTED post-commit (grantSignupBonus runs inside the
  // not-yet-committed user-creation tx, where an analyticsEvent.userId FK
  // insert would fail).
  get signupGrantAmount(): number {
    return this.signupBonus;
  }

  // ── SKU classification (shared with SubscriptionService) ─────────────────

  isAutoRenewableSku(productId: string | null | undefined): boolean {
    return !!productId && (PRO_SKUS as readonly string[]).includes(productId);
  }

  isCreditProduct(productId: string | null | undefined): boolean {
    return (
      !!productId &&
      (productId === PAY_ONCE_SKU ||
        Object.prototype.hasOwnProperty.call(PACK_CREDITS, productId))
    );
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  // Pure read — never writes, never reconciles. Safe behind a GET.
  async getBalance(userId: number): Promise<ScanCreditBalance> {
    const available = await this.availableBalance(this.prisma, userId);
    const schedule = await this.computeProSchedule(this.prisma, userId);
    return { available, nextProGrantAt: schedule?.nextProGrantAt ?? null };
  }

  private async availableBalance(
    client: DbClient,
    userId: number,
  ): Promise<number> {
    const agg = await client.scanCreditGrant.aggregate({
      _sum: { remaining: true },
      where: {
        userId,
        remaining: { gt: 0 },
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    return agg._sum.remaining ?? 0;
  }

  // ── Grants ───────────────────────────────────────────────────────────────

  // Called INSIDE the caller's user-creation $transaction. Uses the passed tx
  // client only — no nested $transaction, no advisory lock (a brand-new user
  // id has no concurrent contender).
  async grantSignupBonus(
    tx: Prisma.TransactionClient,
    userId: number,
  ): Promise<void> {
    if (this.signupBonus <= 0) return;
    await tx.scanCreditGrant.create({
      data: {
        userId,
        source: 'signup_bonus',
        amount: this.signupBonus,
        remaining: this.signupBonus,
      },
    });
  }

  // Idempotent on transactionId via the partial unique index + the
  // findFirst-under-lock guard. No-op for non-credit products.
  async grantPurchase(
    userId: number,
    productId: string,
    transactionId: string,
    environment?: string | null,
  ): Promise<void> {
    let amount: number;
    let source: ScanCreditSource;
    if (Object.prototype.hasOwnProperty.call(PACK_CREDITS, productId)) {
      amount = PACK_CREDITS[productId];
      source = 'purchase';
    } else if (productId === PAY_ONCE_SKU) {
      amount = this.payOnceAmount;
      source = 'pay_once';
    } else {
      return;
    }
    if (amount <= 0 || !transactionId) return;

    let created = false;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::bigint)`;
      const existing = await tx.scanCreditGrant.findFirst({
        where: {
          userId,
          externalRef: transactionId,
          source: { in: ['purchase', 'pay_once'] },
        },
        select: { id: true },
      });
      if (existing) return;
      await tx.scanCreditGrant.create({
        data: {
          userId,
          source,
          productId,
          amount,
          remaining: amount,
          externalRef: transactionId,
          environment: environment ?? null,
        },
      });
      created = true;
    });

    // Fire-and-forget AFTER commit, only on a real create — replays of
    // /subscription/validate (existing found) leave `created` false and a
    // rollback throws above before we reach here, so each purchase = one row.
    if (created) {
      void this.analytics.track(AnalyticsEventName.SCAN_PACK_PURCHASED, {
        userId,
        properties: { source, productId, amount, transactionId },
      });
    }
  }

  // App-update reward: grants `SCAN_GRANT_APP_UPGRADE` credits the first time a
  // user reports running a given app version >= the configured floor. Idempotent
  // per (user, version) via the advisory lock + findFirst guard, backstopped by
  // the `scan_credit_grant_app_upgrade_uq` partial unique index. Always returns
  // the caller's current balance (even on the no-op paths) so the endpoint can
  // hand a fresh balance back to the client.
  async grantAppUpgrade(
    userId: number,
    rawVersion: string,
  ): Promise<ScanCreditBalance> {
    const version = this.normalizeVersion(rawVersion);
    const eligible =
      this.appUpgradeEnabled &&
      this.appUpgradeAmount > 0 &&
      version !== null &&
      this.compareVersions(version, this.appUpgradeMinVersion) >= 0;
    if (!eligible) return this.getBalance(userId);

    const amount = this.appUpgradeAmount;
    let created = false;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::bigint)`;
      const existing = await tx.scanCreditGrant.findFirst({
        where: { userId, source: 'app_upgrade', externalRef: version },
        select: { id: true },
      });
      if (existing) return;
      await tx.scanCreditGrant.create({
        data: {
          userId,
          source: 'app_upgrade',
          productId: version,
          amount,
          remaining: amount,
          externalRef: version,
        },
      });
      created = true;
    });

    // Fire-and-forget AFTER commit, only on a real create (mirrors adminAdjust).
    if (created) {
      void this.analytics.track(AnalyticsEventName.SCAN_CREDITS_GRANTED, {
        userId,
        properties: { source: 'app_upgrade', amount, version },
      });
    }
    return this.getBalance(userId);
  }

  // Rewarded-ad reward: +1 credit per completed ad view, at most
  // REWARDED_AD_DAILY_CAP grants per UTC day. Idempotent per (user, adKey) —
  // the client generates one UUID per completed view and retries with the same
  // key on network failure. Unlike app_upgrade there is no partial-unique-index
  // backstop; the per-user advisory lock serializes replays, which is the only
  // race possible for a same-user key.
  async grantRewardedAd(
    userId: number,
    adKey: string,
  ): Promise<{ granted: boolean; remainingToday: number }> {
    let granted = false;
    let remainingToday = 0;
    let created = false;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::bigint)`;
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const todayCount = await tx.scanCreditGrant.count({
        where: {
          userId,
          source: 'rewarded_ad',
          grantedAt: { gte: startOfDay },
        },
      });
      const existing = await tx.scanCreditGrant.findFirst({
        where: { userId, source: 'rewarded_ad', externalRef: adKey },
        select: { id: true },
      });
      if (existing) {
        // Replay of an already-granted view: report success so a retrying
        // client sees a consistent outcome, but create nothing.
        granted = true;
        remainingToday = Math.max(0, REWARDED_AD_DAILY_CAP - todayCount);
        return;
      }
      if (todayCount >= REWARDED_AD_DAILY_CAP) {
        remainingToday = 0;
        return;
      }
      await tx.scanCreditGrant.create({
        data: {
          userId,
          source: 'rewarded_ad',
          amount: REWARDED_AD_AMOUNT,
          remaining: REWARDED_AD_AMOUNT,
          externalRef: adKey,
        },
      });
      granted = true;
      created = true;
      remainingToday = Math.max(0, REWARDED_AD_DAILY_CAP - todayCount - 1);
    });

    // Fire-and-forget AFTER commit, only on a real create (mirrors grantAppUpgrade).
    if (created) {
      void this.analytics.track(AnalyticsEventName.SCAN_CREDITS_GRANTED, {
        userId,
        properties: { source: 'rewarded_ad', amount: REWARDED_AD_AMOUNT },
      });
    }
    return { granted, remainingToday };
  }

  // Mission-shop redemption (30⚡ → scan credits). Runs inside the CALLER's
  // already-locked transaction (MissionsService.redeem holds the per-user
  // advisory lock), so no lock or idempotency guard here — the RewardRedemption
  // row is the record of the redeem and `externalRef` ties the grant to it.
  // The caller emits SCAN_CREDITS_GRANTED after its transaction commits.
  async grantMissionReward(
    tx: Prisma.TransactionClient,
    userId: number,
    amount: number,
    externalRef: string,
  ): Promise<void> {
    await tx.scanCreditGrant.create({
      data: {
        userId,
        source: 'mission_reward',
        amount,
        remaining: amount,
        externalRef,
      },
    });
  }

  // Trims and validates a marketing version string (e.g. "1.2.5"); returns null
  // for empty/garbage so the caller no-ops. CFBundleShortVersionString is
  // numeric dotted, so up to 4 segments is sufficient.
  private normalizeVersion(raw: string | null | undefined): string | null {
    const v = (raw ?? '').trim();
    return /^\d+(\.\d+){0,3}$/.test(v) ? v : null;
  }

  // Numeric segment compare, padding the shorter side with zeros so
  // "1.2" === "1.2.0" and "1.2.5" > "1.2". Returns -1 | 0 | 1.
  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const da = pa[i] ?? 0;
      const db = pb[i] ?? 0;
      if (da !== db) return da > db ? 1 : -1;
    }
    return 0;
  }

  // ── Apple refund clawback / reversal ─────────────────────────────────────

  // Finds a purchase/pay_once grant by EITHER Apple id. grantPurchase set
  // externalRef to the transactionId passed from the validate path; for a
  // consumable, transactionId === originalTransactionId at purchase and the
  // ASSN re-sends the same transactionId on refund. Matching the id-set is
  // correct regardless of Apple's exact refund-id semantics.
  private async findPurchaseGrant(
    originalTransactionId: string,
    transactionId: string,
  ): Promise<{
    id: number;
    userId: number;
    amount: number;
    productId: string | null;
  } | null> {
    const refs = [originalTransactionId, transactionId].filter(
      (r): r is string => !!r,
    );
    if (refs.length === 0) return null;
    return this.prisma.scanCreditGrant.findFirst({
      where: {
        externalRef: { in: refs },
        source: { in: ['purchase', 'pay_once'] },
      },
      select: { id: true, userId: true, amount: true, productId: true },
    });
  }

  // Apple REFUND / REVOKE: zero the grant's UNUSED credits (remaining → 0) and
  // stamp revokedAt. Already-consumed scans are NOT reversed. Idempotent via
  // the revokedAt guard. Returns refund metrics for analytics (or null when no
  // matching grant). `applied=false` ⇒ already revoked (idempotent replay) so
  // callers must NOT emit a duplicate analytics event.
  async revokePurchase(
    originalTransactionId: string,
    transactionId: string,
  ): Promise<RefundResult | null> {
    const grant = await this.findPurchaseGrant(
      originalTransactionId,
      transactionId,
    );
    if (!grant) return null;

    let clawedBack = 0;
    let consumedAtRefund = 0;
    let applied = false;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${grant.userId}::bigint)`;
      // Race-safe read of remaining-at-refund (a concurrent consume() holds
      // the same per-user lock, so this reflects the true state).
      const row = await tx.scanCreditGrant.findUnique({
        where: { id: grant.id },
        select: { remaining: true, revokedAt: true, amount: true },
      });
      if (!row) return;
      applied = row.revokedAt == null;
      clawedBack = applied ? row.remaining : 0;
      consumedAtRefund = row.amount - row.remaining;
      await tx.scanCreditGrant.updateMany({
        where: { id: grant.id, revokedAt: null },
        data: { remaining: 0, revokedAt: new Date() },
      });
    });
    return {
      userId: grant.userId,
      productId: grant.productId,
      grantedAmount: grant.amount,
      clawedBack,
      consumedAtRefund,
      restored: 0,
      applied,
    };
  }

  // Apple REFUND_REVERSED: undo a clawback. Restore the credits the user
  // actually still had at refund time = amount − non-refunded consumptions
  // drawn from this grant. Idempotent (no-op / applied=false when not revoked).
  async restorePurchase(
    originalTransactionId: string,
    transactionId: string,
  ): Promise<RefundResult | null> {
    const grant = await this.findPurchaseGrant(
      originalTransactionId,
      transactionId,
    );
    if (!grant) return null;

    let restored = 0;
    let consumedAtRefund = 0;
    let applied = false;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${grant.userId}::bigint)`;
      const row = await tx.scanCreditGrant.findUnique({
        where: { id: grant.id },
        select: { revokedAt: true, amount: true },
      });
      if (!row) return;
      applied = row.revokedAt != null;
      const consumed = await tx.scanCreditConsumption.count({
        where: { grantId: grant.id, refundedAt: null },
      });
      consumedAtRefund = consumed;
      restored = Math.max(0, row.amount - consumed);
      await tx.scanCreditGrant.updateMany({
        where: { id: grant.id, revokedAt: { not: null } },
        data: { remaining: restored, revokedAt: null },
      });
    });
    return {
      userId: grant.userId,
      productId: grant.productId,
      grantedAmount: grant.amount,
      clawedBack: 0,
      consumedAtRefund,
      restored,
      applied,
    };
  }

  // Read-only snapshot for the REFUND_DECLINED branch — records "who + state"
  // without mutating the ledger.
  async peekPurchaseGrant(
    originalTransactionId: string,
    transactionId: string,
  ): Promise<{
    userId: number;
    productId: string | null;
    grantedAmount: number;
    remaining: number;
  } | null> {
    const grant = await this.findPurchaseGrant(
      originalTransactionId,
      transactionId,
    );
    if (!grant) return null;
    const row = await this.prisma.scanCreditGrant.findUnique({
      where: { id: grant.id },
      select: { remaining: true },
    });
    return {
      userId: grant.userId,
      productId: grant.productId,
      grantedAmount: grant.amount,
      remaining: row?.remaining ?? 0,
    };
  }

  // Positive manual adjustment. Negative/clawback is out of scope for v1.
  async adminAdjust(
    userId: number,
    amount: number,
    note?: string,
  ): Promise<void> {
    if (amount <= 0) return;
    await this.prisma.scanCreditGrant.create({
      data: {
        userId,
        source: 'admin_adjustment',
        amount,
        remaining: amount,
        externalRef: note ?? null,
      },
    });
    void this.analytics.track(AnalyticsEventName.SCAN_CREDITS_GRANTED, {
      userId,
      properties: { source: 'admin_adjustment', amount, note: note ?? null },
    });
  }

  // ── Pro per-billing-cycle reconciliation ─────────────────────────────────

  // Fire-and-forget SCAN_CREDITS_GRANTED for newly-created pro-cycle grants.
  // Called by BOTH reconcile entrypoints AFTER their tx commits (the user
  // already exists → no analyticsEvent.userId FK hazard); never inside the tx.
  // No-op unless rows were actually inserted, so replays don't double-count.
  // `periods` = number of billing cycles granted (usually 1 per renewal);
  // `amount` = summed credits across them (handles mixed-SKU plan switches).
  private emitProGrant(userId: number, res: ProReconcileResult): void {
    if (res.created <= 0 || !res.proSku) return;
    void this.analytics.track(AnalyticsEventName.SCAN_CREDITS_GRANTED, {
      userId,
      properties: {
        source: 'pro_weekly_grant',
        productId: res.proSku,
        amount: res.totalCredits,
        periods: res.created,
      },
    });
  }

  // Standalone entrypoint (subscription validate / webhook). Opens its own
  // advisory-locked transaction. Tolerates "no pro transaction rows yet".
  async reconcileProGrants(userId: number): Promise<void> {
    const res = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::bigint)`;
      return this.reconcileWithTx(tx, userId);
    });
    this.emitProGrant(userId, res);
  }

  // Assumes the caller already holds the per-user advisory lock on `tx`.
  // Grants the full cycle amount once per Apple Pro SubscriptionTransaction
  // (initial purchase + each renewal). Idempotent: keyed by
  // (userId, externalRef=originalTransactionId, periodKey=renewalTransactionId)
  // via the existing `period_key IS NOT NULL` partial unique index — old
  // integer period keys never collide with txn-id strings. Returns how many
  // grants it inserted + their summed credits so the post-commit caller can
  // emit analytics exactly once per real grant.
  private async reconcileWithTx(
    tx: Prisma.TransactionClient,
    userId: number,
  ): Promise<ProReconcileResult> {
    const sched = await this.computeProSchedule(tx, userId);
    if (!sched || sched.txns.length === 0)
      return { created: 0, totalCredits: 0, proSku: null };

    const existing = await tx.scanCreditGrant.findMany({
      where: {
        userId,
        source: 'pro_weekly_grant',
        externalRef: sched.originalTransactionId,
      },
      select: { periodKey: true },
    });
    // Old per-7-day rows (periodKey '0','1',…) are harmlessly present; a
    // transactionId string can never equal them, so they never block a
    // real renewal grant.
    const have = new Set(existing.map((g) => g.periodKey));

    const toCreate: Prisma.ScanCreditGrantCreateManyInput[] = [];
    for (const txn of sched.txns) {
      if (txn.revocationDate != null) continue; // refunded/revoked cycle
      if (have.has(txn.transactionId)) continue; // already granted
      const amt = this.proCycleAmounts[txn.productId as ProSku] ?? 0;
      if (amt <= 0) continue;
      toCreate.push({
        userId,
        source: 'pro_weekly_grant',
        productId: txn.productId,
        amount: amt,
        remaining: amt,
        externalRef: sched.originalTransactionId,
        periodKey: txn.transactionId,
        environment: txn.environment ?? null,
      });
    }
    const lastSku = sched.txns[sched.txns.length - 1].productId;
    if (toCreate.length === 0)
      return { created: 0, totalCredits: 0, proSku: lastSku };

    const res = await tx.scanCreditGrant.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
    // skipDuplicates ⇒ res.count is rows ACTUALLY inserted (a concurrent
    // reconcile that won the race skips its duplicates → count 0).
    if (res.count === 0)
      return { created: 0, totalCredits: 0, proSku: lastSku };
    const totalCredits = toCreate.reduce((s, g) => s + g.amount, 0);
    return {
      created: res.count,
      totalCredits,
      proSku: toCreate[toCreate.length - 1].productId ?? lastSku,
    };
  }

  // Loads the active Pro subscription's transactions (one per initial
  // purchase + each renewal) and when the next billing cycle's credits
  // arrive. No 7-day math — a full cycle's credits are granted per txn.
  private async computeProSchedule(
    client: DbClient,
    userId: number,
  ): Promise<ProSchedule | null> {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        originalTransactionId: true,
      },
    });
    if (!user || !user.originalTransactionId) return null;

    const txns = await client.subscriptionTransaction.findMany({
      where: {
        userId,
        originalTransactionId: user.originalTransactionId,
        productId: { in: PRO_SKUS as unknown as string[] },
      },
      select: {
        transactionId: true,
        productId: true,
        revocationDate: true,
        environment: true,
      },
      // Oldest first — deterministic order (orderBy needs no select).
      orderBy: { purchaseDate: 'asc' },
    });
    if (txns.length === 0) return null;

    // Stale-ACTIVE guard (see subscription-status.util) — a Google Play sub
    // with no RTDN wired can sit at stored ACTIVE forever after it lapses.
    // Route through the shared predicate so this can't drift from
    // subscription.service's resolveTier() again (that drift is what shipped
    // the "renews Thursday" bug with a two-week-stale date on device, and
    // separately let a local ACTIVE_PAID_STATUSES copy here omit
    // BILLING_RETRY — Apple keeps retrying the charge during that state, so a
    // renewal can still land and grant a cycle; excluding it just hid the
    // next-grant date from users the rest of the app already treats as Pro).
    const isActive = isEntitledToPro({
      subscriptionStatus: user.subscriptionStatus,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    });
    // The next cycle's credits arrive when the subscription renews (= the
    // current period's expiry) while active; nothing scheduled otherwise.
    const nextProGrantAt =
      isActive && user.subscriptionExpiresAt
        ? user.subscriptionExpiresAt
        : null;

    return {
      originalTransactionId: user.originalTransactionId,
      txns,
      nextProGrantAt,
    };
  }

  // ── Consume / refund ─────────────────────────────────────────────────────

  // Spends 1 credit for `sessionId`. Advisory-locked + reconciles Pro grants
  // as the safety net (the moment correctness actually matters). Idempotent:
  // re-consuming an already-charged sessionId is a no-op.
  async consume(userId: number, sessionId: string): Promise<ScanCreditBalance> {
    const { balance, proReconcile } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::bigint)`;

        const already = await tx.scanCreditConsumption.findUnique({
          where: { sessionId },
          select: { id: true },
        });
        if (already)
          return {
            balance: await this.balanceWithTx(tx, userId),
            proReconcile: null as ProReconcileResult | null,
          };

        const proReconcile = await this.reconcileWithTx(tx, userId);

        const grant = await tx.scanCreditGrant.findFirst({
          where: {
            userId,
            remaining: { gt: 0 },
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: [
            { expiresAt: { sort: 'asc', nulls: 'last' } },
            { grantedAt: 'asc' },
            { id: 'asc' },
          ],
          select: { id: true },
        });

        if (!grant) {
          const bal = await this.balanceWithTx(tx, userId);
          throw new InsufficientScanCreditsException({
            available: bal.available,
            nextProGrantAt: bal.nextProGrantAt,
            canPurchase: true,
          });
        }

        await tx.scanCreditGrant.update({
          where: { id: grant.id },
          data: { remaining: { decrement: 1 } },
        });
        await tx.scanCreditConsumption.create({
          data: { userId, grantId: grant.id, sessionId, amount: 1 },
        });

        return {
          balance: await this.balanceWithTx(tx, userId),
          proReconcile,
        };
      },
    );

    // Pro grants the safety-net reconcile just created (rare backstop for a
    // missed webhook). Emitted post-commit so this path isn't silently lost.
    if (proReconcile) this.emitProGrant(userId, proReconcile);
    return balance;
  }

  // Idempotent. Restores the 1 credit to the grant it was drawn from. Safe to
  // call for a sessionId that never consumed (cache hits) — no-op.
  async refund(sessionId: string): Promise<void> {
    try {
      const consumption = await this.prisma.scanCreditConsumption.findUnique({
        where: { sessionId },
        select: { userId: true, grantId: true, refundedAt: true },
      });
      if (!consumption || consumption.refundedAt) return;

      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${consumption.userId}::bigint)`;
        const updated = await tx.scanCreditConsumption.updateMany({
          where: { sessionId, refundedAt: null },
          data: { refundedAt: new Date() },
        });
        if (updated.count === 0) return;
        // Guarded by revokedAt: a credit refund must not resurrect a grant
        // that an Apple refund already clawed back. Consumption is still
        // marked refunded above (audit preserved); the increment just no-ops.
        await tx.scanCreditGrant.updateMany({
          where: { id: consumption.grantId, revokedAt: null },
          data: { remaining: { increment: 1 } },
        });
      });
    } catch (err) {
      this.logger.warn(
        `refund for ${sessionId} failed: ${(err as Error).message}`,
      );
    }
  }

  private async balanceWithTx(
    tx: Prisma.TransactionClient,
    userId: number,
  ): Promise<ScanCreditBalance> {
    const available = await this.availableBalance(tx, userId);
    const schedule = await this.computeProSchedule(tx, userId);
    return { available, nextProGrantAt: schedule?.nextProGrantAt ?? null };
  }
}
