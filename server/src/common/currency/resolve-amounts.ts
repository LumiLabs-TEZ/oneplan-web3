import { Currency, Prisma } from '@prisma/client';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';

export interface ResolvedAmounts {
  amount: Prisma.Decimal; // canonical in home currency
  originalAmount: Prisma.Decimal; // what user typed
  originalCurrency: Currency;
  exchangeRate: Prisma.Decimal; // multiplier: originalAmount * rate = amount
  isStale: boolean; // true if upstream rate was stale/fallback
}

/**
 * Resolves the 4 amount fields for a create/update.
 * - If dto has both originalAmount + originalCurrency: converts to tripCurrency using live rate.
 * - Else: treats `amount` as already in tripCurrency (originalCurrency = tripCurrency, rate = 1).
 */
export async function resolveAmounts(
  rates: ExchangeRatesService,
  tripCurrency: Currency,
  dto: {
    amount?: number;
    originalAmount?: number;
    originalCurrency?: Currency;
  },
): Promise<ResolvedAmounts> {
  const hasOriginal =
    dto.originalAmount !== undefined && dto.originalCurrency !== undefined;

  if (hasOriginal) {
    const originalAmount = new Prisma.Decimal(dto.originalAmount!);
    const originalCurrency = dto.originalCurrency!;
    const { rate, isStale } = await rates.getRate(
      originalCurrency,
      tripCurrency,
    );
    // Round to the Decimal(18,2) column precision here so the in-memory value
    // matches what Postgres persists — share math downstream relies on
    // sum(shares) === amount holding exactly.
    const converted = originalAmount.mul(rate).toDecimalPlaces(2);
    return {
      amount: converted,
      originalAmount,
      originalCurrency,
      exchangeRate: rate,
      isStale,
    };
  }

  // No original fields: treat `amount` as already in home (trip) currency.
  const amount = new Prisma.Decimal(dto.amount ?? 0);
  return {
    amount,
    originalAmount: amount,
    originalCurrency: tripCurrency,
    exchangeRate: new Prisma.Decimal(1),
    isStale: false,
  };
}
