import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { PlanRouteMapCard } from './PlanRouteMapCard';
import type { DayPin } from '../helpers/planDays';

function pin(id: number, index: number): DayPin {
  return {
    id,
    index,
    title: `Pin ${index}`,
    latitude: 10 + index * 0.01,
    longitude: 106 + index * 0.01,
    subtitle: null,
    timeLabel: null,
  };
}

beforeAll(() => {
  initI18n();
});

describe('PlanRouteMapCard', () => {
  it('renders nothing when there are no pins', async () => {
    const { toJSON } = await render(<PlanRouteMapCard title="Day 1" pins={[]} legs={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('renders the title and pin count', async () => {
    const pins = [pin(1, 1), pin(2, 2)];
    await render(<PlanRouteMapCard title="Day 1" pins={pins} legs={[]} />);
    expect(screen.getByText('Day 1')).toBeTruthy();
    expect(screen.getByText('2 pins')).toBeTruthy();
  });

  it('calls onViewDetails when the "View details" button is pressed', async () => {
    const onViewDetails = jest.fn();
    const pins = [pin(1, 1), pin(2, 2)];
    await render(
      <PlanRouteMapCard title="Day 1" pins={pins} legs={[]} onViewDetails={onViewDetails} />,
    );
    await fireEvent.press(screen.getByText('View details'));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });

  it('calls onViewDetails when the map overlay is pressed', async () => {
    const onViewDetails = jest.fn();
    const pins = [pin(1, 1), pin(2, 2)];
    await render(
      <PlanRouteMapCard title="Day 1" pins={pins} legs={[]} onViewDetails={onViewDetails} />,
    );
    await fireEvent.press(screen.getByTestId('plan-route-map-card'));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });
});
