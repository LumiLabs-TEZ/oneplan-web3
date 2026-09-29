import { BadRequestException } from '@nestjs/common';
import { Currency, Prisma, TripStatus } from '@prisma/client';
import {
  buildCurrencyRateMap,
  migrateTripCurrency,
} from './currency-migration';
import { TripsService } from './trips.service';

const D = (n: number | string) => new Prisma.Decimal(n);

describe('buildCurrencyRateMap', () => {
  it('fetches one rate per distinct source currency including the old home currency', async () => {
    const prisma = {
      budget: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ originalCurrency: Currency.THB }]),
      },
      expense: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { originalCurrency: Currency.THB },
            { originalCurrency: Currency.USD },
          ]),
      },
    } as any;
    const rates = {
      getRate: jest.fn().mockResolvedValue({ rate: D(2), isStale: false }),
    } as any;

    const { map, staleCurrencies } = await buildCurrencyRateMap(
      prisma,
      rates,
      1,
      Currency.USD,
      Currency.VND,
    );

    expect(rates.getRate).toHaveBeenCalledTimes(2);
    expect(rates.getRate).toHaveBeenCalledWith(Currency.USD, Currency.VND);
    expect(rates.getRate).toHaveBeenCalledWith(Currency.THB, Currency.VND);
    expect([...map.keys()].sort()).toEqual([Currency.THB, Currency.USD]);
    expect(staleCurrencies).toEqual([]);
  });

  it('reports every source currency whose rate was stale or a fallback', async () => {
    const prisma = {
      budget: { findMany: jest.fn().mockResolvedValue([]) },
      expense: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ originalCurrency: Currency.THB }]),
      },
    } as any;
    const rates = {
      getRate: jest
        .fn()
        .mockImplementation((from: Currency) =>
          Promise.resolve({ rate: D(2), isStale: from === Currency.THB }),
        ),
    } as any;

    const { staleCurrencies } = await buildCurrencyRateMap(
      prisma,
      rates,
      1,
      Currency.USD,
      Currency.VND,
    );

    expect(staleCurrencies).toEqual([Currency.THB]);
  });
});

describe('migrateTripCurrency', () => {
  // USD → VND at 25000; THB → VND at 700.
  const rateFor = new Map([
    [Currency.USD, D(25000)],
    [Currency.THB, D(700)],
  ]);

  function makeTx(expenses: any[], budgets: any[]) {
    return {
      expense: {
        findMany: jest.fn().mockResolvedValue(expenses),
        update: jest.fn().mockResolvedValue({}),
      },
      expenseShare: { update: jest.fn().mockResolvedValue({}) },
      budget: {
        findMany: jest.fn().mockResolvedValue(budgets),
        update: jest.fn().mockResolvedValue({}),
      },
      budgetPayment: { updateMany: jest.fn().mockResolvedValue({}) },
    } as any;
  }

  it('converts a home-entered expense with populated original fields, restamping only the rate', async () => {
    const tx = makeTx(
      [
        {
          id: 10,
          amount: D('12.34'),
          originalAmount: D('12.34'),
          originalCurrency: Currency.USD,
          exchangeRate: D(1),
          shares: [],
        },
      ],
      [],
    );

    await migrateTripCurrency(tx, rateFor, 1, Currency.USD);

    expect(tx.expense.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        amount: D('308500'),
        originalAmount: D('12.34'),
        originalCurrency: Currency.USD,
        exchangeRate: D(25000),
      },
    });
  });

  it('backfills original fields on legacy home-entered rows with nulls', async () => {
    const tx = makeTx(
      [
        {
          id: 11,
          amount: D('10'),
          originalAmount: null,
          originalCurrency: null,
          exchangeRate: null,
          shares: [],
        },
      ],
      [],
    );

    await migrateTripCurrency(tx, rateFor, 1, Currency.USD);

    expect(tx.expense.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: {
        amount: D('250000'),
        originalAmount: D('10'),
        originalCurrency: Currency.USD,
        exchangeRate: D(25000),
      },
    });
  });

  it('re-derives foreign-entered rows from originalAmount at the current rate', async () => {
    const tx = makeTx(
      [
        {
          id: 12,
          amount: D('2.86'), // old: 100 THB → USD
          originalAmount: D('100'),
          originalCurrency: Currency.THB,
          exchangeRate: D('0.0286'),
          shares: [],
        },
      ],
      [],
    );

    await migrateTripCurrency(tx, rateFor, 1, Currency.USD);

    expect(tx.expense.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: {
        amount: D('70000'), // 100 THB × 700
        originalAmount: D('100'),
        originalCurrency: Currency.THB,
        exchangeRate: D(700),
      },
    });
  });

  it('scales shares and pushes the rounding residual onto the largest share', async () => {
    // 3-way split of 10.00 at rate 0.11: shares 3.33/3.33/3.34 scale to
    // 0.37/0.37/0.37 (rounded) but the total converts to 1.10 → residual
    // -0.01 lands on the largest share (3.34 → 0.36... adjusted).
    const smallRate = new Map([[Currency.USD, D('0.11')]]);
    const tx = makeTx(
      [
        {
          id: 13,
          amount: D('10'),
          originalAmount: D('10'),
          originalCurrency: Currency.USD,
          exchangeRate: D(1),
          shares: [
            { id: 1, shareAmount: D('3.33') },
            { id: 2, shareAmount: D('3.33') },
            { id: 3, shareAmount: D('3.34') },
          ],
        },
      ],
      [],
    );

    await migrateTripCurrency(tx, smallRate, 1, Currency.USD);

    const written = tx.expenseShare.update.mock.calls.map(
      ([arg]: any[]) => arg.data.shareAmount as Prisma.Decimal,
    );
    const sum = written.reduce(
      (acc: Prisma.Decimal, s: Prisma.Decimal) => acc.add(s),
      D(0),
    );
    expect(sum.equals(D('1.1'))).toBe(true);
    // All scaled shares tie at 0.37, so the first one absorbs the residual.
    const id1 = tx.expenseShare.update.mock.calls.find(
      ([arg]: any[]) => arg.where.id === 1,
    )[0];
    expect(id1.data.shareAmount.equals(D('0.36'))).toBe(true);
  });

  it('converts budgets, mirrors perPersonAmount for GROUP scope, and bulk-updates payments', async () => {
    const tx = makeTx(
      [],
      [
        {
          id: 20,
          amount: D('100'),
          perPersonAmount: D('100'),
          originalAmount: D('100'),
          originalCurrency: Currency.USD,
          exchangeRate: D(1),
        },
        {
          id: 21,
          amount: D('50'),
          perPersonAmount: null,
          originalAmount: null,
          originalCurrency: null,
          exchangeRate: null,
        },
      ],
    );

    await migrateTripCurrency(tx, rateFor, 1, Currency.USD);

    expect(tx.budget.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: expect.objectContaining({
        amount: D('2500000'),
        perPersonAmount: D('2500000'),
      }),
    });
    expect(tx.budget.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: expect.objectContaining({
        amount: D('1250000'),
        perPersonAmount: null,
        originalAmount: D('50'),
        originalCurrency: Currency.USD,
      }),
    });
    expect(tx.budgetPayment.updateMany).toHaveBeenCalledWith({
      where: { budgetId: 20 },
      data: { amount: D('2500000') },
    });
  });

  it('throws (rolling the tx back) when a foreign row has no rate in the map', async () => {
    // THB row, but the map only carries the home currency — simulates a
    // foreign-entered row created after the rate map was built.
    const homeOnly = new Map([[Currency.USD, D(25000)]]);
    const tx = makeTx(
      [
        {
          id: 30,
          amount: D('2.86'),
          originalAmount: D('100'),
          originalCurrency: Currency.THB,
          exchangeRate: D('0.0286'),
          shares: [],
        },
      ],
      [],
    );

    await expect(
      migrateTripCurrency(tx, homeOnly, 1, Currency.USD),
    ).rejects.toThrow('Missing THB rate for currency migration');
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('round-trips a foreign-entered expense exactly on A→B→A', async () => {
    // 100 THB entered on a USD trip. Migrate USD→VND, then VND→USD.
    const row = {
      id: 31,
      amount: D('2.86'),
      originalAmount: D('100'),
      originalCurrency: Currency.THB,
      exchangeRate: D('0.0286'),
      shares: [],
    };
    const toVnd = new Map([
      [Currency.USD, D(25000)],
      [Currency.THB, D(700)],
    ]);
    const tx1 = makeTx([row], []);
    await migrateTripCurrency(tx1, toVnd, 1, Currency.USD);
    const afterFirst = tx1.expense.update.mock.calls[0][0].data;
    expect(afterFirst.amount.equals(D('70000'))).toBe(true);

    // Second migration back to USD: THB→USD at the original 0.0286.
    const toUsd = new Map([
      [Currency.VND, D('0.00004')],
      [Currency.THB, D('0.0286')],
    ]);
    const tx2 = makeTx([{ ...row, ...afterFirst, shares: [] }], []);
    await migrateTripCurrency(tx2, toUsd, 1, Currency.VND);
    const afterSecond = tx2.expense.update.mock.calls[0][0].data;

    // Re-derived from originalAmount (100 THB), not the drifted VND amount.
    expect(afterSecond.amount.equals(D('2.86'))).toBe(true);
    expect(afterSecond.originalAmount.equals(D('100'))).toBe(true);
    expect(afterSecond.originalCurrency).toBe(Currency.THB);
  });

  it('re-derives a backfilled home-entered row from originalAmount on the second migration', async () => {
    // Legacy row on a USD trip: first migration (USD→VND) backfills
    // originalCurrency=USD. On the second migration (VND→USD) the row is
    // foreign-classified and re-derives from originalAmount exactly.
    const legacy = {
      id: 32,
      amount: D('10'),
      originalAmount: null,
      originalCurrency: null,
      exchangeRate: null,
      shares: [],
    };
    const toVnd = new Map([[Currency.USD, D(25000)]]);
    const tx1 = makeTx([legacy], []);
    await migrateTripCurrency(tx1, toVnd, 1, Currency.USD);
    const afterFirst = tx1.expense.update.mock.calls[0][0].data;
    expect(afterFirst.originalCurrency).toBe(Currency.USD);
    expect(afterFirst.amount.equals(D('250000'))).toBe(true);

    const toUsd = new Map([
      [Currency.VND, D('0.00004')],
      [Currency.USD, D(1)],
    ]);
    const tx2 = makeTx([{ ...legacy, ...afterFirst, shares: [] }], []);
    await migrateTripCurrency(tx2, toUsd, 1, Currency.VND);
    const afterSecond = tx2.expense.update.mock.calls[0][0].data;
    expect(afterSecond.amount.equals(D('10'))).toBe(true);
  });

  it('converts a foreign row whose originalCurrency equals the new currency at rate 1', async () => {
    // THB-entered row on a USD trip, migrating to THB: getRate(THB,THB)
    // returns 1, so amount becomes exactly the entered THB value.
    const toThb = new Map([
      [Currency.USD, D('0.035')],
      [Currency.THB, D(1)],
    ]);
    const tx = makeTx(
      [
        {
          id: 33,
          amount: D('2.86'),
          originalAmount: D('100'),
          originalCurrency: Currency.THB,
          exchangeRate: D('0.0286'),
          shares: [],
        },
      ],
      [],
    );

    await migrateTripCurrency(tx, toThb, 1, Currency.USD);

    expect(tx.expense.update).toHaveBeenCalledWith({
      where: { id: 33 },
      data: {
        amount: D('100'),
        originalAmount: D('100'),
        originalCurrency: Currency.THB,
        exchangeRate: D(1),
      },
    });
  });

  it('keeps a zero-amount expense at zero with no share residual', async () => {
    const tx = makeTx(
      [
        {
          id: 34,
          amount: D('0'),
          originalAmount: D('0'),
          originalCurrency: Currency.USD,
          exchangeRate: D(1),
          shares: [
            { id: 1, shareAmount: D('0') },
            { id: 2, shareAmount: D('0') },
          ],
        },
      ],
      [],
    );

    await migrateTripCurrency(tx, rateFor, 1, Currency.USD);

    expect(tx.expense.update.mock.calls[0][0].data.amount.equals(D('0'))).toBe(
      true,
    );
    for (const [arg] of tx.expenseShare.update.mock.calls) {
      expect(arg.data.shareAmount.equals(D('0'))).toBe(true);
    }
  });

  it('migrates all shares without filtering on isSettled, in deterministic id order', async () => {
    // Settled shares are re-denominated too (by design — the client warns
    // "including settled amounts"). The share query must not filter on
    // isSettled and must order by id for a deterministic residual tie-break.
    const tx = makeTx(
      [
        {
          id: 35,
          amount: D('10'),
          originalAmount: D('10'),
          originalCurrency: Currency.USD,
          exchangeRate: D(1),
          shares: [
            { id: 1, shareAmount: D('5') },
            { id: 2, shareAmount: D('5') },
          ],
        },
      ],
      [],
    );

    await migrateTripCurrency(tx, rateFor, 1, Currency.USD);

    expect(tx.expense.findMany).toHaveBeenCalledWith({
      where: { tripId: 1 },
      include: {
        shares: {
          select: { id: true, shareAmount: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    expect(tx.expenseShare.update).toHaveBeenCalledTimes(2);
  });

  it('gives a single-share expense the full amount including any residual', async () => {
    // 10 USD at 0.11 → amount 1.10; the lone share (10 → 1.10 exactly here)
    // must always equal the expense amount.
    const smallRate = new Map([[Currency.USD, D('0.115')]]);
    const tx = makeTx(
      [
        {
          id: 36,
          amount: D('10'),
          originalAmount: D('10'),
          originalCurrency: Currency.USD,
          exchangeRate: D(1),
          shares: [{ id: 1, shareAmount: D('10') }],
        },
      ],
      [],
    );

    await migrateTripCurrency(tx, smallRate, 1, Currency.USD);

    const amount = tx.expense.update.mock.calls[0][0].data.amount;
    const share = tx.expenseShare.update.mock.calls[0][0].data.shareAmount;
    expect(share.equals(amount)).toBe(true);
  });

  it('converts a desynced home-classified row from amount, not originalAmount', async () => {
    // originalCurrency === old home, but originalAmount no longer matches
    // amount (e.g. legacy pre-fix removeMember rewrite). Home-classified
    // rows convert the live amount — the stale originalAmount is NOT used.
    const tx = makeTx(
      [
        {
          id: 37,
          amount: D('20'), // reduced after a member left
          originalAmount: D('30'), // stale
          originalCurrency: Currency.USD,
          exchangeRate: D(1),
          shares: [],
        },
      ],
      [],
    );

    await migrateTripCurrency(tx, rateFor, 1, Currency.USD);

    expect(
      tx.expense.update.mock.calls[0][0].data.amount.equals(D('500000')),
    ).toBe(true);
  });
});

describe('TripsService.updateTrip currency validation', () => {
  function makeService(overrides: {
    tripStatus?: TripStatus;
    currency?: Currency;
    /** What the vault guard says about ending without the end-trip vote. */
    endGuard?: () => Promise<void>;
  }) {
    const vaultSafety = {
      assertEndableWithoutConsensus: jest
        .fn()
        .mockImplementation(overrides.endGuard ?? (() => Promise.resolve())),
    };
    const prisma = {
      tripMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      trip: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          startDate: null,
          endDate: null,
          currency: overrides.currency ?? Currency.USD,
          status: overrides.tripStatus ?? TripStatus.PLANNING,
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    } as any;
    const service = new TripsService(
      prisma,
      { log: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      { sendTripSettlementUpdated: jest.fn(), sendTripEnded: jest.fn() } as any,
      {} as any,
      { track: jest.fn() } as any,
      { getRate: jest.fn() } as any,
      { onTripPossiblySettled: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      vaultSafety as any,
    );
    // Membership assertion goes through assertMember → prisma.tripMember.
    jest.spyOn(service as any, 'assertMember').mockResolvedValue(undefined);
    return { service, prisma, vaultSafety };
  }

  it('rejects a currency change on an ENDED trip', async () => {
    const { service } = makeService({ tripStatus: TripStatus.ENDED });
    await expect(
      service.updateTrip(1, 1, { currency: Currency.VND } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects changing currency and ending the trip in the same call', async () => {
    const { service } = makeService({ tripStatus: TripStatus.ONGOING });
    await expect(
      service.updateTrip(1, 1, {
        currency: Currency.VND,
        status: TripStatus.ENDED,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('treats same-currency updates as a plain update (no migration)', async () => {
    const { service, prisma } = makeService({ currency: Currency.USD });
    prisma.trip.update.mockResolvedValue({ id: 1, name: 't' });
    jest
      .spyOn(service as any, 'findTripDetail')
      .mockResolvedValue({ id: 1 } as any);

    await service.updateTrip(1, 1, { currency: Currency.USD } as any);

    expect(prisma.trip.update).toHaveBeenCalled();
  });

  // S5: a plain status PATCH would strand a vault's USDC past end-consensus.
  describe('ending a trip that has a group wallet', () => {
    it('is refused unless it goes through the end-trip vote', async () => {
      const { service, prisma } = makeService({
        tripStatus: TripStatus.ONGOING,
        endGuard: () =>
          Promise.reject(new BadRequestException('use the end-trip vote')),
      });

      await expect(
        service.updateTrip(1, 1, { status: TripStatus.ENDED } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.trip.update).not.toHaveBeenCalled();
    });

    it('is checked for ENDED only, never for other status changes', async () => {
      const { service, prisma, vaultSafety } = makeService({
        tripStatus: TripStatus.PLANNING,
      });
      prisma.trip.update.mockResolvedValue({ id: 1, name: 't' });
      jest
        .spyOn(service as any, 'findTripDetail')
        .mockResolvedValue({ id: 1 } as any);

      await service.updateTrip(1, 1, { name: 'renamed' } as any);

      expect(vaultSafety.assertEndableWithoutConsensus).not.toHaveBeenCalled();
    });

    it('does not re-check a trip that is already ENDED', async () => {
      const { service, vaultSafety, prisma } = makeService({
        tripStatus: TripStatus.ENDED,
      });
      prisma.trip.update.mockResolvedValue({ id: 1, name: 't' });
      jest
        .spyOn(service as any, 'findTripDetail')
        .mockResolvedValue({ id: 1 } as any);

      await service.updateTrip(1, 1, { status: TripStatus.ENDED } as any);

      expect(vaultSafety.assertEndableWithoutConsensus).not.toHaveBeenCalled();
    });
  });
});
