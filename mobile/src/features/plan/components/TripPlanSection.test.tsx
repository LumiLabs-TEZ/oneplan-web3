import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { TripDetail } from '@/features/trip/TripDetailContext';
import { initI18n } from '@/i18n';

import { TripPlanSection } from './TripPlanSection';
import { availableDays, dateForDay } from '../helpers/planDays';
import type { PlanItemDto } from '../types';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockIsPro = jest.fn(() => true);
jest.mock('@/features/subscription/api/queries', () => ({ useIsPro: () => mockIsPro() }));

// `useDayRoute` hits a real network query (`usePlanRoute`) — stub it so this stays a pure
// render/interaction test, mirroring `TodaysActivitiesCard.test.tsx`'s pattern.
jest.mock('../hooks/useDayRoute', () => ({
  useDayRoute: (
    _tripId: unknown,
    pins: readonly unknown[],
    _date: unknown,
  ): { pins: readonly unknown[]; legs: unknown[]; hasServerLegs: boolean; isLoading: boolean } => ({
    pins,
    legs: [],
    hasServerLegs: false,
    isLoading: false,
  }),
}));

// Each timeline row mounts a `PlanItemVoice`, which calls `useVoicePlayer`/`useDownloadUrl` — stub
// both so this stays a pure render/interaction test without a real `QueryClientProvider`.
jest.mock('@/native/audio', () => ({
  useVoicePlayer: () => ({ playing: false, progress: 0, toggle: jest.fn(), stop: jest.fn() }),
}));
jest.mock('@/features/plan/api/queries', () => ({
  useDownloadUrl: () => ({ isError: false }),
}));

beforeAll(() => {
  initI18n();
});

let nextId = 1;
function item(overrides: Partial<PlanItemDto> = {}): PlanItemDto {
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

function makeDetail(
  overrides: Partial<TripDetail> = {},
  planItems: PlanItemDto[] = [],
): TripDetail {
  return {
    tripId: 1,
    trip: {
      id: 1,
      name: 'Trip',
      status: 'PLANNING',
      currency: 'USD',
      localCurrencies: [],
      createdById: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      inviteCode: 'abc',
      marketplaceListingId: null,
      userMarketplaceRating: null,
      members: [],
    },
    members: [],
    budgets: [],
    expenses: [],
    breakdown: undefined,
    planItems,
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

function planDayFor(detail: TripDetail, selectedDay: number) {
  const ctx = {
    isPlanningMode: detail.trip?.status === 'PLANNING',
    startDate: detail.trip?.startDate ?? null,
    endDate: detail.trip?.endDate ?? null,
    planItems: detail.planItems,
  };
  return {
    ctx,
    days: availableDays(ctx),
    selectedDay,
    setSelectedDay: jest.fn(),
    dateForSelected: dateForDay(ctx.startDate, selectedDay),
    canAddDay: true,
  };
}

beforeEach(() => {
  nextId = 1;
  jest.clearAllMocks();
});

describe('TripPlanSection', () => {
  it('shows the empty state and hides "New Plan" when read-only', async () => {
    const detail = makeDetail({}, []);
    await render(
      <TripPlanSection
        detail={detail}
        planDay={planDayFor(detail, 1)}
        onNewPlan={jest.fn()}
        onItemPress={jest.fn()}
        onRearrange={jest.fn()}
        onAddDay={jest.fn()}
        readOnly
      />,
    );
    expect(screen.getByTestId('trip-plan-empty')).toBeTruthy();
    expect(screen.queryByTestId('plan-new-button')).toBeNull();
  });

  it('shows "New Plan" in the empty state when not read-only and calls onNewPlan with the day', async () => {
    const detail = makeDetail({}, []);
    const onNewPlan = jest.fn();
    await render(
      <TripPlanSection
        detail={detail}
        planDay={planDayFor(detail, 2)}
        onNewPlan={onNewPlan}
        onItemPress={jest.fn()}
        onRearrange={jest.fn()}
        onAddDay={jest.fn()}
        readOnly={false}
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-new-button'));
    expect(onNewPlan).toHaveBeenCalledWith({ day: 2, date: null });
  });

  it('does not show the overview map card with only one pin', async () => {
    const items = [item({ dayNumber: 1, startTime: '08:00', latitude: 10, longitude: 106 })];
    const detail = makeDetail({}, items);
    await render(
      <TripPlanSection
        detail={detail}
        planDay={planDayFor(detail, 1)}
        onNewPlan={jest.fn()}
        onItemPress={jest.fn()}
        onRearrange={jest.fn()}
        onAddDay={jest.fn()}
        readOnly={false}
      />,
    );
    expect(screen.queryByText('Plan overview')).toBeNull();
  });

  it('shows the overview map card once there are 2+ pins and renders the timeline + distance connector', async () => {
    const items = [
      item({
        id: 1,
        dayNumber: 1,
        startTime: '08:00',
        latitude: 10,
        longitude: 106,
        title: 'Coffee',
      }),
      item({
        id: 2,
        dayNumber: 1,
        startTime: '09:00',
        latitude: 10.5,
        longitude: 106.5,
        title: 'Museum',
      }),
    ];
    const detail = makeDetail({}, items);
    const onItemPress = jest.fn();
    await render(
      <TripPlanSection
        detail={detail}
        planDay={planDayFor(detail, 1)}
        onNewPlan={jest.fn()}
        onItemPress={onItemPress}
        onRearrange={jest.fn()}
        onAddDay={jest.fn()}
        readOnly={false}
      />,
    );
    expect(screen.getByText('Plan overview')).toBeTruthy();
    expect(screen.getByTestId('plan-item-1')).toBeTruthy();
    expect(screen.getByTestId('plan-item-2')).toBeTruthy();
    expect(screen.getByTestId('plan-distance-1')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('plan-item-2'));
    expect(onItemPress).toHaveBeenCalledWith(items[1]);
  });

  it('navigates to the day map when the overview card is pressed', async () => {
    const items = [
      item({ id: 1, dayNumber: 1, startTime: '08:00', latitude: 10, longitude: 106 }),
      item({ id: 2, dayNumber: 1, startTime: '09:00', latitude: 10.5, longitude: 106.5 }),
    ];
    const detail = makeDetail({}, items);
    await render(
      <TripPlanSection
        detail={detail}
        planDay={planDayFor(detail, 1)}
        onNewPlan={jest.fn()}
        onItemPress={jest.fn()}
        onRearrange={jest.fn()}
        onAddDay={jest.fn()}
        readOnly={false}
      />,
    );
    await fireEvent.press(screen.getByText('View details'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/trip/[tripId]/plan/day-map',
      params: { tripId: '1', day: '1', date: undefined },
    });
  });

  it('offers Explore on market beside New Plan when the trip has no plans at all', async () => {
    const detail = makeDetail({}, []);
    await render(
      <TripPlanSection
        detail={detail}
        planDay={planDayFor(detail, 1)}
        onNewPlan={jest.fn()}
        onItemPress={jest.fn()}
        onRearrange={jest.fn()}
        onAddDay={jest.fn()}
        readOnly={false}
      />,
    );
    expect(screen.queryByText('Market')).toBeNull();
    expect(screen.getByTestId('plan-new-button')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-explore-market'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/market', params: { tripId: '1' } });
  });

  it('sends free users to the paywall instead of the market', async () => {
    mockIsPro.mockReturnValue(false);
    (router.push as jest.Mock).mockClear();
    const detail = makeDetail({}, []);
    await render(
      <TripPlanSection
        detail={detail}
        planDay={planDayFor(detail, 1)}
        onNewPlan={jest.fn()}
        onItemPress={jest.fn()}
        onRearrange={jest.fn()}
        onAddDay={jest.fn()}
        readOnly={false}
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-explore-market'));
    expect(router.push).toHaveBeenCalledWith('/paywall');
    expect(router.push).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/market' }));
    mockIsPro.mockReturnValue(true);
  });

  it('shows only New Plan on an empty day when other days have plans', async () => {
    const detail = makeDetail({}, [item({ id: 1, dayNumber: 1, startTime: '08:00' })]);
    await render(
      <TripPlanSection
        detail={detail}
        planDay={planDayFor(detail, 2)}
        onNewPlan={jest.fn()}
        onItemPress={jest.fn()}
        onRearrange={jest.fn()}
        onAddDay={jest.fn()}
        readOnly={false}
      />,
    );
    expect(screen.getByTestId('plan-new-button')).toBeTruthy();
    expect(screen.queryByTestId('plan-explore-market')).toBeNull();
  });

  it('hides both actions when read-only', async () => {
    const detail = makeDetail({}, []);
    await render(
      <TripPlanSection
        detail={detail}
        planDay={planDayFor(detail, 1)}
        onNewPlan={jest.fn()}
        onItemPress={jest.fn()}
        onRearrange={jest.fn()}
        onAddDay={jest.fn()}
        readOnly
      />,
    );
    expect(screen.queryByTestId('plan-new-button')).toBeNull();
    expect(screen.queryByTestId('plan-explore-market')).toBeNull();
  });

  it('shows the iOS "No plans" empty card', async () => {
    const detail = makeDetail({}, []);
    await render(
      <TripPlanSection
        detail={detail}
        planDay={planDayFor(detail, 1)}
        onNewPlan={jest.fn()}
        onItemPress={jest.fn()}
        onRearrange={jest.fn()}
        onAddDay={jest.fn()}
        readOnly={false}
      />,
    );
    expect(screen.getByText('No plans')).toBeTruthy();
  });

  it('selects the new day once "+ add" has appended it', async () => {
    const detail = makeDetail({}, [item({ id: 1, dayNumber: 1, startTime: '08:00' })]);
    const planDay = { ...planDayFor(detail, 1), days: [1], setSelectedDay: jest.fn() };
    const onAddDay = jest.fn();
    const props = {
      detail,
      onNewPlan: jest.fn(),
      onItemPress: jest.fn(),
      onRearrange: jest.fn(),
      onAddDay,
      readOnly: false,
    };
    await render(<TripPlanSection {...props} planDay={planDay} />);
    await fireEvent.press(screen.getByTestId('plan-add-day-chip'));
    expect(onAddDay).toHaveBeenCalledTimes(1);
    expect(planDay.setSelectedDay).not.toHaveBeenCalled();

    await screen.rerender(<TripPlanSection {...props} planDay={{ ...planDay, days: [1, 2] }} />);
    expect(planDay.setSelectedDay).toHaveBeenCalledWith(2);
  });
});
