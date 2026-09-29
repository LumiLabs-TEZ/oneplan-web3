import { fireEvent, render, screen } from '@testing-library/react-native';

import type { PlanItemDto } from '../types';
import { PlanItemCard } from './PlanItemCard';

function planItem(overrides: Partial<PlanItemDto> = {}): PlanItemDto {
  return {
    id: 1,
    tripId: 1,
    planDate: '2026-03-10',
    title: 'Breakfast',
    description: null,
    location: null,
    latitude: null,
    longitude: null,
    address: null,
    startTime: null,
    category: null,
    voiceUrl: null,
    voiceDuration: null,
    imageUrls: [],
    dayNumber: null,
    sortOrder: 0,
    createdAt: '2026-03-10T08:00:00.000Z',
    members: [],
    ...overrides,
  };
}

describe('PlanItemCard', () => {
  it('renders the title and fires onPress on tap', async () => {
    const onPress = jest.fn();
    await render(
      <PlanItemCard item={planItem()} markerColor="#FF591F" onPress={onPress} testID="card" />,
    );
    expect(screen.getByText('Breakfast')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('hides the location line when there is no location', async () => {
    await render(<PlanItemCard item={planItem()} markerColor="#FF591F" onPress={jest.fn()} />);
    expect(screen.queryByText(/Dubai/)).toBeNull();
  });

  it('shows the location line when present', async () => {
    await render(
      <PlanItemCard
        item={planItem({ location: 'Burj Khalifa, Dubai, UAE' })}
        markerColor="#FF591F"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Burj Khalifa, Dubai, UAE')).toBeTruthy();
  });

  it('shows the description block only when a description is set', async () => {
    await render(
      <PlanItemCard
        item={planItem({ description: 'Try Shawarma' })}
        markerColor="#FF591F"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Try Shawarma')).toBeTruthy();
  });

  it('renders the voice pill enabled and toggling when a voice handler is given', async () => {
    const onToggle = jest.fn();
    await render(
      <PlanItemCard
        item={planItem({ voiceDuration: 72 })}
        markerColor="#FF591F"
        onPress={jest.fn()}
        voice={{ playing: false, onToggle }}
        testID="card"
      />,
    );
    expect(screen.getByText('1:12')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('card-voice'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders the voice pill disabled when voiceDuration is set but no voice handler is given', async () => {
    await render(
      <PlanItemCard
        item={planItem({ voiceDuration: 72 })}
        markerColor="#FF591F"
        onPress={jest.fn()}
        testID="card"
      />,
    );
    expect(screen.getByTestId('card-voice').props.accessibilityState?.disabled).toBe(true);
  });

  it('hides the voice pill when there is no voiceDuration', async () => {
    await render(
      <PlanItemCard item={planItem()} markerColor="#FF591F" onPress={jest.fn()} testID="card" />,
    );
    expect(screen.queryByTestId('card-voice')).toBeNull();
  });

  it('renders the image strip only when imageUrls is non-empty', async () => {
    await render(
      <PlanItemCard
        item={planItem({ imageUrls: ['https://img.test/1.jpg'] })}
        markerColor="#FF591F"
        onPress={jest.fn()}
        testID="card"
      />,
    );
    expect(screen.getByTestId('card-strip')).toBeTruthy();
  });

  it('hides the image strip when imageUrls is empty', async () => {
    await render(
      <PlanItemCard item={planItem()} markerColor="#FF591F" onPress={jest.fn()} testID="card" />,
    );
    expect(screen.queryByTestId('card-strip')).toBeNull();
  });
});
