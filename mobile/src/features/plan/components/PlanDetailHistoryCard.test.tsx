import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { initI18n } from '@/i18n';

import { PlanDetailHistoryCard } from './PlanDetailHistoryCard';

jest.mock('expo-router', () => ({
  // See OrbitMapCard.test.tsx: minimal stand-in for `useFocusEffect`.
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    useEffect(effect, [effect]);
  },
}));

beforeAll(() => {
  initI18n();
});

const baseProps = {
  timeAndDate: '09:30 - Day 1',
  locationName: 'District 1',
  location: 'District 1',
  whoJoin: '2 members',
  message: 'Bring cash',
  onDirectionPress: jest.fn(),
};

describe('PlanDetailHistoryCard', () => {
  it('hides the map card when there is no coordinate', async () => {
    await render(<PlanDetailHistoryCard {...baseProps} locationCoordinate={null} />);
    expect(screen.queryByTestId('plan-detail-map-card')).toBeNull();
    expect(screen.queryByTestId('plan-detail-direction')).toBeNull();
  });

  it('shows the map card when a coordinate is present', async () => {
    await render(
      <PlanDetailHistoryCard
        {...baseProps}
        locationCoordinate={{ latitude: 10.77, longitude: 106.7 }}
      />,
    );
    expect(screen.getByTestId('plan-detail-map-card')).toBeTruthy();
    expect(screen.getByTestId('plan-detail-direction')).toBeTruthy();
  });

  it('fires onDirectionPress when the direction pill is pressed', async () => {
    const onDirectionPress = jest.fn();
    await render(
      <PlanDetailHistoryCard
        {...baseProps}
        locationCoordinate={{ latitude: 10.77, longitude: 106.7 }}
        onDirectionPress={onDirectionPress}
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-detail-direction'));
    expect(onDirectionPress).toHaveBeenCalledTimes(1);
  });

  it('renders the audio badge slot', async () => {
    await render(
      <PlanDetailHistoryCard
        {...baseProps}
        locationCoordinate={null}
        audioBadge={<Text>0:45</Text>}
      />,
    );
    expect(screen.getByText('0:45')).toBeTruthy();
  });

  it('renders the row values', async () => {
    await render(<PlanDetailHistoryCard {...baseProps} locationCoordinate={null} />);
    expect(screen.getByText('09:30 - Day 1')).toBeTruthy();
    expect(screen.getByText('2 members')).toBeTruthy();
    expect(screen.getByText('Bring cash')).toBeTruthy();
  });

  it('disables the Location row when there is no coordinate', async () => {
    const onLocationPress = jest.fn();
    await render(
      <PlanDetailHistoryCard
        {...baseProps}
        locationCoordinate={null}
        onLocationPress={onLocationPress}
      />,
    );
    const row = screen.getByTestId('plan-detail-location');
    expect(row.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(row);
    expect(onLocationPress).not.toHaveBeenCalled();
  });

  it('enables the Location row and fires onLocationPress when coords are present', async () => {
    const onLocationPress = jest.fn();
    await render(
      <PlanDetailHistoryCard
        {...baseProps}
        locationCoordinate={{ latitude: 10.77, longitude: 106.7 }}
        onLocationPress={onLocationPress}
      />,
    );
    const row = screen.getByTestId('plan-detail-location');
    expect(row.props.accessibilityState?.disabled).toBeFalsy();
    await fireEvent.press(row);
    expect(onLocationPress).toHaveBeenCalledTimes(1);
  });
});
