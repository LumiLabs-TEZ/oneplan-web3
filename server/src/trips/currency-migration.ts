import { Currency, Prisma } from '@prisma/client';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';

/** Rate multipliers into the NEW trip currency, keyed by source currency. */
export type CurrencyRateMap = Map<Currency, Prisma.Decimal>;

export interface CurrencyRateMapResult {
  map: CurrencyRateMap;
  /** Source currencies whose rate came from a stale cache or static fallback. */
  staleCurrencies: Currency[];
}

const round2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2);

/**
 * Pre-fetches one rate per distinct source currency (old home currency plus
 * every originalCurrency present on the trip's budgets/expenses) into the new
 * currency. Runs BEFORE the migration transaction so external rate lookups
 * never extend the transaction. Stale/fallback rates are accepted, matching
 * expense creation, but reported via `staleCurrencies` so the caller can
 * surface them (rateStale flag + warning log).
 */
export async function buildCurrencyRateMap(
  prisma: PrismaService,
  rates: ExchangeRatesService,
  tripId: number,
  oldCurrency: Currency,
  newCurrency: Currency,
): Promise<CurrencyRateMapResult> {
  const [budgetCurrencies, expenseCurrencies] = await Promise.all([
    prisma.budget.findMany({
      where: { tripId, originalCurrency: { not: null } },
      select: { originalCurrency: true },
      distinct: ['originalCurrency'],
    }),
    prisma.expense.findMany({
      where: { tripId, originalCurrency: { not: null } },
      select: { originalCurrency: true },
      distinct: ['originalCurrency'],
    }),
  ]);

  const needed = new Set<Currency>([oldCurrency]);
  for (const row of [...budgetCurrencies, ...expenseCurrencies]) {
    if (row.originalCurrency) needed.add(row.originalCurrency);
  }

  const map: CurrencyRateMap = new Map();
  const staleCurrencies: Currency[] = [];
  for (const currency of needed) {
    const { rate, isStale } = await rates.getRate(currency, newCurrency);
    map.set(currency, rate);
    if (isStale) staleCurrencies.push(currency);
  }
  return { map, staleCurrencies };
}

/**
 * Re-denominates every money row of a trip from `oldCurrency` to the new
 * currency (which every rate in `rateFor` targets). Must run inside the same
 * transaction that updates `trip.currency`, after the trip row is updated.
 *
 * Policy ("today's rate for all"):
 * - Foreign-entered rows (originalCurrency ≠ old home) re-derive from
 *   originalAmount at the current originalCurrency→new rate.
 * - Home-entered rows convert `amount` at the old→new rate; legacy rows with
 *   null original fields get them backfilled from the old values so every row
 *   keeps the `originalAmount × exchangeRate ≈ amount` invariant.
 * - ExpenseShares scale by the old→new rate with the rounding residual pushed
 *   onto the largest share, so sum(shares) === expense.amount stays exact.
 * - BudgetPayment.amount always mirrors the budget amount (see
 *   budgets.service create/update), so payments are set to the new amount.
 */
export async function migrateTripCurrency(
  tx: Prisma.TransactionClient,
  rateFor: CurrencyRateMap,
  tripId: number,
  oldCurrency: Currency,
): Promise<void> {
  const homeRate = rateFor.get(oldCurrency);
  if (!homeRate) {
    throw new Error(`Missing ${oldCurrency} rate for currency migration`);
  }

  const resolveRow = (row: {
    amount: Prisma.Decimal;
    originalAmount: Prisma.Decimal | null;
    originalCurrency: Currency | null;
  }) => {
    const isForeign =
      row.originalCurrency !== null && row.originalCurrency !== oldCurrency;
    // A missing rate means the row's originalCurrency appeared after the rate
    // map was built (rate lookups run outside this transaction). Throw so the
    // whole migration rolls back and the client retries — converting at the
    // home rate instead would be off by orders of magnitude.
    let rate: Prisma.Decimal;
    if (isForeign) {
      const foreignRate = rateFor.get(row.originalCurrency!);
      if (!foreignRate) {
        throw new Error(
          `Missing ${row.originalCurrency} rate for currency migration`,
        );
      }
      rate = foreignRate;
    } else {
      rate = homeRate;
    }
    const newAmount = isForeign
      ? round2(row.originalAmount!.mul(rate))
      : round2(row.amount.mul(homeRate));
    return {
      amount: newAmount,
      originalAmount: row.originalAmount ?? row.amount,
      originalCurrency: row.originalCurrency ?? oldCurrency,
      exchangeRate: rate,
    };
  };

  const expenses = await tx.expense.findMany({
    where: { tripId },
    include: {
      shares: {
        select: { id: true, shareAmount: true },
        // Deterministic order so the residual tie-break ("largest share,
        // first wins") does not depend on physical row order.
        orderBy: { id: 'asc' },
      },
    },
  });
  for (const expense of expenses) {
    const resolved = resolveRow(expense);
    await tx.expense.update({
      where: { id: expense.id },
      data: resolved,
    });

    if (expense.shares.length > 0) {
      // Shares are stored in the old home currency: scale each, then push
      // the rounding residual onto the largest share (same reconciliation as
      // the bill-split path in expenses.service).
      const scaled = expense.shares.map((share) => ({
        id: share.id,
        shareAmount: round2(share.shareAmount.mul(homeRate)),
      }));
      const sum = scaled.reduce(
        (acc, share) => acc.add(share.shareAmount),
        new Prisma.Decimal(0),
      );
      const residual = resolved.amount.sub(sum);
      if (!residual.isZero()) {
        let largestIdx = 0;
        for (let i = 1; i < scaled.length; i++) {
          if (scaled[i].shareAmount.gt(scaled[largestIdx].shareAmount)) {
            largestIdx = i;
          }
        }
        scaled[largestIdx].shareAmount =
          scaled[largestIdx].shareAmount.add(residual);
      }
      for (const share of scaled) {
        await tx.expenseShare.update({
          where: { id: share.id },
          data: { shareAmount: share.shareAmount },
        });
      }
    }
  }

  const budgets = await tx.budget.findMany({ where: { tripId } });
  for (const budget of budgets) {
    const resolved = resolveRow(budget);
    await tx.budget.update({
      where: { id: budget.id },
      data: {
        ...resolved,
        // GROUP scope charges each contributor the full amount; PERSONAL
        // budgets keep null.
        perPersonAmount:
          budget.perPersonAmount !== null ? resolved.amount : null,
      },
    });
    await tx.budgetPayment.updateMany({
      where: { budgetId: budget.id },
      data: { amount: resolved.amount },
    });
  }
}
