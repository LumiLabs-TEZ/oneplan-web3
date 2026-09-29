import { fireEvent, render, screen } from '@testing-library/react-native';

import type { components } from '@/api/schema';

import { formatTripDateRange, PlanningDestinationCard } from './PlanningDestinationCard';

type TripSummaryDto = components['schemas']['TripSummaryDto'];

const trip: TripSummaryDto = {
  id: 3,
  name: 'Tokyo in autumn',
  status: 'PLANNING',
  startDate: '2026-11-02',
  endDate: '2026-11-09',
  memberCount: 2,
  currency: 'JPY',
};

describe('PlanningDestinationCard', () => {
  it('renders the name without dates (iOS parity), and calls onPress', async () => {
    const onPress = jest.fn();
    await render(<PlanningDestinationCard trip={trip} rotate={-1.2} onPress={onPress} />);
    expect(screen.getByText('Tokyo in autumn')).toBeTruthy();
    expect(screen.queryByText('Nov 2 – Nov 9')).toBeNull();
    await fireEvent.press(screen.getByTestId('planning-destination-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('formatTripDateRange', () => {
  it('collapses a single-day range and tolerates missing dates', () => {
    expect(formatTripDateRange('2026-11-02', '2026-11-02', 'en')).toBe('Nov 2');
    expect(formatTripDateRange('2026-11-02', null, 'en')).toBe('Nov 2');
    expect(formatTripDateRange(null, '2026-11-09', 'en')).toBeNull();
    expect(formatTripDateRange('not-a-date', null, 'en')).toBeNull();
  });
});
