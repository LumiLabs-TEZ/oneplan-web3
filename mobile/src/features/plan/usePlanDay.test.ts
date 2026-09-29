import { act, renderHook } from '@testing-library/react-native';

import type { TripDetail } from '@/features/trip/TripDetailContext';
import type { PlanItemDto, TripDto } from '@/features/trip/types';

import { usePlanningDayCountStore } from './planningDayCountStore';
import { usePlanDay } from './usePlanDay';

let nextId = 1;
function makeItem(overrides: Partial<PlanItemDto> = {}): PlanItemDto {
  return {
    id: nextId++,
    tripId: 1,
    title: 'Item',
    imageUrls: [],
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    members: [],
    ...overrides,
  };
}

function makeTrip(overrides: Partial<TripDto> = {}): TripDto {
  return {
    id: 1,
    name: 'Trip',
    status: 'PLANNING',
    currency: 'USD',
    localCurrencies: [],
    createdById: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    inviteCode: 'abc',
    web3: false,
    marketplaceListingId: null,
    userMarketplaceRating: null,
    members: [],
    ...overrides,
  };
}

function makeDetail(overrides: Partial<TripDetail> = {}): TripDetail {
  return {
    tripId: 1,
    trip: makeTrip(),
    members: [],
    budgets: [],
    expenses: [],
    breakdown: undefined,
    planItems: [],
    homeCurrency: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    access: { canEdit: true, isOffline: false, tabBarEnabled: true } as TripDetail['access'],
    online: true,
    servingCached: false,
    cachedAt: null,
    isLoading: false,
    expensesLoading: false,
    planItemsLoading: false,
    error: null,
    refetchAll: async () => undefined,
    ...overrides,
  };
}

beforeEach(() => {
  nextId = 1;
  // The planning-day counter is shared module-level state (`planningDayCountStore`), keyed by
  // `tripId` — reset it so one test's bump doesn't leak into the next.
  usePlanningDayCountStore.setState({ counts: {} });
});

describe('usePlanDay', () => {
  it('seeds days from planningDayCount when the trip has no scheduled dates', async () => {
    const detail = makeDetail({ planItems: [makeItem({ dayNumber: 3 })] });
    const { result } = await renderHook(() => usePlanDay(detail));
    expect(result.current.days).toEqual([1, 2, 3]);
    expect(result.current.localDayCount).toBe(3);
  });

  it('picks the initial day once the trip has loaded', async () => {
    const detail = makeDetail({ planItems: [makeItem({ dayNumber: 2 })] });
    const { result } = await renderHook(() => usePlanDay(detail));
    expect(result.current.selectedDay).toBe(1);
  });

  it('bumpLocalDayCount grows the day chip strip even with no items on the new day', async () => {
    const detail = makeDetail({ planItems: [makeItem({ dayNumber: 1 })] });
    const { result, rerender } = await renderHook((d: TripDetail) => usePlanDay(d), {
      initialProps: detail,
    });
    expect(result.current.days).toEqual([1]);

    await act(async () => {
      result.current.bumpLocalDayCount(1);
    });
    await rerender(detail);
    expect(result.current.days).toEqual([1, 2]);
    expect(result.current.canAddDay).toBe(true);
  });

  it('re-clamps the selected day when days shrink out from under it', async () => {
    // `localDayCount` never shrinks on its own (only `bumpLocalDayCount`, from a later task's
    // day-delete flow, can lower it) — so a realistic shrink combines a negative bump with the
    // items for the deleted day going away, mirroring `deleteDayOps` (`helpers/planDays.ts`).
    const detail = makeDetail({ planItems: [makeItem({ dayNumber: 3 })] });
    const { result, rerender } = await renderHook((d: TripDetail) => usePlanDay(d), {
      initialProps: detail,
    });
    await act(async () => {
      result.current.setSelectedDay(3);
    });
    await rerender(detail);
    expect(result.current.selectedDay).toBe(3);

    await act(async () => {
      result.current.bumpLocalDayCount(-2);
    });
    const shrunk = makeDetail({ planItems: [makeItem({ dayNumber: 1 })] });
    await rerender(shrunk);
    expect(result.current.days).toEqual([1]);
    expect(result.current.selectedDay).toBe(1);
  });

  it('uses the scheduled date range instead of the local counter once the trip has dates', async () => {
    const detail = makeDetail({
      trip: makeTrip({
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-03T00:00:00.000Z',
      }),
      planItems: [],
    });
    const { result } = await renderHook(() => usePlanDay(detail));
    expect(result.current.days).toEqual([1, 2, 3]);
    expect(result.current.dateForSelected).toBe('2026-03-01');
  });

  it('a bump from one hook instance is visible to another instance for the same tripId', async () => {
    // Mirrors the trip-detail Plan tab (`usePlanDay`) and a create/edit plan-item form route
    // reading/bumping the same `planningDayCountStore` entry — the counter has to be visible
    // across separate component trees, not just within one hook instance.
    const detailA = makeDetail({ tripId: 5, planItems: [makeItem({ tripId: 5, dayNumber: 1 })] });
    const detailB = makeDetail({ tripId: 5, planItems: [makeItem({ tripId: 5, dayNumber: 1 })] });

    const a = await renderHook(() => usePlanDay(detailA));
    const b = await renderHook(() => usePlanDay(detailB));

    expect(a.result.current.days).toEqual([1]);
    expect(b.result.current.days).toEqual([1]);

    await act(async () => {
      a.result.current.bumpLocalDayCount(1);
    });
    await a.rerender(detailA);
    await b.rerender(detailB);

    expect(a.result.current.days).toEqual([1, 2]);
    expect(b.result.current.days).toEqual([1, 2]);
  });

  it('does not leak a bump into an unrelated tripId', async () => {
    const detailA = makeDetail({ tripId: 1, planItems: [makeItem({ dayNumber: 1 })] });
    const detailB = makeDetail({ tripId: 2, planItems: [makeItem({ tripId: 2, dayNumber: 1 })] });

    const a = await renderHook(() => usePlanDay(detailA));
    const b = await renderHook(() => usePlanDay(detailB));

    await act(async () => {
      a.result.current.bumpLocalDayCount(1);
    });
    await a.rerender(detailA);
    await b.rerender(detailB);

    expect(a.result.current.days).toEqual([1, 2]);
    expect(b.result.current.days).toEqual([1]);
  });

  it('canAddDay is false once availableDays reaches the 14-day cap', async () => {
    const detail = makeDetail({ planItems: [makeItem({ dayNumber: 14 })] });
    const { result } = await renderHook(() => usePlanDay(detail));
    expect(result.current.days).toHaveLength(14);
    expect(result.current.canAddDay).toBe(false);
  });
});
