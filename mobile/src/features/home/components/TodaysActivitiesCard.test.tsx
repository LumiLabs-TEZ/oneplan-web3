import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { components } from '@/api/schema';
import { initI18n } from '@/i18n';

import { TodaysActivitiesCard } from './TodaysActivitiesCard';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// `useDayRoute` hits `usePlanRoute` (a real network query) — stub it so this test stays a pure
// render/interaction test of the wrapper, mirroring `TripEndBreakdownTab.test.tsx`'s pattern of
// mocking the underlying data hook instead of wiring a real `QueryClientProvider`.
jest.mock('@/features/plan/hooks/useDayRoute', () => ({
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

type PlanItemDto = components['schemas']['PlanItemDto'];

function item(
  id: number,
  title: string,
  opts: { startTime?: string | null; lat?: number; lon?: number } = {},
): PlanItemDto {
  return {
    id,
    tripId: 1,
    title,
    startTime: opts.startTime ?? null,
    latitude: opts.lat ?? 10 + id,
    longitude: opts.lon ?? 106 + id,
    imageUrls: [],
    sortOrder: id,
    createdAt: '2026-09-13T00:00:00.000Z',
    members: [],
  };
}

beforeAll(() => {
  initI18n();
});

describe('TodaysActivitiesCard', () => {
  it('renders nothing when there are no pins', async () => {
    const { toJSON } = await render(
      <TodaysActivitiesCard pins={[]} tripId={1} date="2026-09-16" />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders a route map card with the day title and pin count', async () => {
    const pins = [
      { index: 1, item: item(11, 'Morning coffee', { startTime: '08:30' }) },
      { index: 2, item: item(12, 'Dragon Bridge') },
    ];
    await render(<TodaysActivitiesCard pins={pins} tripId={7} date="2026-09-16" />);
    expect(screen.getByText('Today’s activities')).toBeTruthy();
    expect(screen.getByText('2 pins')).toBeTruthy();
    expect(screen.getByTestId('todays-activities-card')).toBeTruthy();
  });

  it('navigates to the day map when "View details" is pressed', async () => {
    const pins = [{ index: 1, item: item(11, 'Morning coffee') }];
    await render(<TodaysActivitiesCard pins={pins} tripId={7} date="2026-09-16" />);
    await fireEvent.press(screen.getByText('View details'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/trip/[tripId]/plan/day-map',
      params: { tripId: '7', date: '2026-09-16' },
    });
  });
});
