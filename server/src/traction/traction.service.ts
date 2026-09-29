import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TractionStatsDto } from './dto/traction-stats.dto';

const PAY_ONCE_SKU = 'pay_once';
// Mirrors PRO_SUBSCRIPTION_SKUS in subscription.service — the
// subscription_transaction table also holds consumable scan-pack rows, so
// public SKU counts must whitelist against these.
const PUBLIC_SKUS = ['pro_weekly', 'pro_monthly', 'pro_yearly', PAY_ONCE_SKU];

// Aggregates are several full-table scans; the endpoint is public, so serve a
// cached snapshot and recompute at most once per TTL.
const CACHE_TTL_MS = 60_000;

@Injectable()
export class TractionService {
  private cache: { data: TractionStatsDto; expiresAt: number } | null = null;
  private inFlight: Promise<TractionStatsDto> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<TractionStatsDto> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.data;
    }
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.computeStats()
      .then((data) => {
        this.cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
        return data;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private async computeStats(): Promise<TractionStatsDto> {
    const [
      totalUsers,
      totalTrips,
      firstTimeDownloadRows,
      activeRows,
      skuRows,
      marketplacePlans,
      topCityRows,
      topCountryRows,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.trip.count(),
      // First-time downloads ≈ unique devices ever seen by analytics. Falls
      // back to user_id for old sessions recorded without an anonymous id.
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT COALESCE(anonymous_id, user_id::text))::bigint AS count
        FROM analytics_session
      `,
      // Distinct entitled users: active Pro statuses ∪ non-revoked pay_once
      // buyers (pay_once is a non-consumable and never drives
      // subscription_status, so it needs the transaction-table union).
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT id AS user_id FROM "user"
           WHERE subscription_status IN ('ACTIVE','GRACE_PERIOD','BILLING_RETRY')
          UNION
          SELECT DISTINCT user_id FROM subscription_transaction
           WHERE product_id = ${PAY_ONCE_SKU} AND revocation_date IS NULL
        ) u
      `,
      this.prisma.user.groupBy({
        by: ['subscriptionProductId'],
        where: { subscriptionProductId: { in: PUBLIC_SKUS } },
        _count: { _all: true },
      }),
      this.prisma.marketplaceListing.count({
        where: { status: 'APPROVED', deletedAt: null },
      }),
      this.prisma.$queryRaw<{ name: string; count: bigint }[]>`
        SELECT c.name AS name, COUNT(*)::bigint AS count
        FROM trip t
        JOIN city c ON c.id = t.city_id
        GROUP BY c.name
        ORDER BY count DESC
        LIMIT 10
      `,
      this.prisma.$queryRaw<{ name: string; count: bigint }[]>`
        SELECT co.name AS name, COUNT(*)::bigint AS count
        FROM trip t
        JOIN country co ON co.id = t.country_id
        GROUP BY co.name
        ORDER BY count DESC
        LIMIT 10
      `,
    ]);

    // pay_once never sets subscriptionProductId, so its bucket comes from the
    // transaction table instead of the user groupBy.
    const payOnceCount = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT user_id)::bigint AS count
      FROM subscription_transaction
      WHERE product_id = ${PAY_ONCE_SKU} AND revocation_date IS NULL
    `;

    const bySkuMap = new Map<string, number>(
      PUBLIC_SKUS.map((sku) => [sku, 0]),
    );
    for (const row of skuRows) {
      if (row.subscriptionProductId) {
        bySkuMap.set(row.subscriptionProductId, row._count._all);
      }
    }
    bySkuMap.set(PAY_ONCE_SKU, Number(payOnceCount[0]?.count ?? 0));

    const toPlaces = (rows: { name: string; count: bigint }[]) =>
      rows.map((row) => ({ name: row.name, trips: Number(row.count) }));

    return {
      totalUsers,
      totalTrips,
      firstTimeDownloads: Number(firstTimeDownloadRows[0]?.count ?? 0),
      subscriptions: {
        active: Number(activeRows[0]?.count ?? 0),
        bySku: Array.from(bySkuMap, ([sku, count]) => ({ sku, count })),
      },
      marketplacePlans,
      topCities: toPlaces(topCityRows),
      topCountries: toPlaces(topCountryRows),
      generatedAt: new Date().toISOString(),
    };
  }
}
