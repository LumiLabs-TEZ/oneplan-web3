import { fireEvent, render, screen } from '@testing-library/react-native';

import type { FeedItem } from '@/features/market/api/queries';
import { initI18n } from '@/i18n';

import { PopularPlansSection } from './PopularPlansSection';

function feedItem(id: number, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    createdById: 1,
    name: `Plan ${id}`,
    creatorName: 'Ken',
    creatorAvatarUrl: null,
    coverImageUrl: null,
    price: '0',
    currency: 'VND',
    tags: [],
    cityName: null,
    stateName: null,
    countryName: null,
    durationDays: 3,
    activityCount: 4,
    appliedCount: 0,
    averageRating: null,
    ratingCount: 0,
    acquired: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeAll(() => {
  initI18n();
});

describe('PopularPlansSection', () => {
  it('renders nothing when there are no items', async () => {
    const { toJSON } = await render(
      <PopularPlansSection items={[]} onItemTapped={jest.fn()} onSeeAll={jest.fn()} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders a polaroid per item with the section header', async () => {
    const items = [feedItem(1, { cityName: 'Da Nang' }), feedItem(2, { countryName: 'Japan' })];
    await render(
      <PopularPlansSection items={items} onItemTapped={jest.fn()} onSeeAll={jest.fn()} />,
    );
    expect(screen.getByText('Popular plans')).toBeTruthy();
    expect(screen.getByText('See all')).toBeTruthy();
    expect(screen.getByTestId('popular-plan-1')).toBeTruthy();
    expect(screen.getByTestId('popular-plan-2')).toBeTruthy();
  });

  it('captions with city, then country, then title', async () => {
    const items = [
      feedItem(1, { cityName: 'Da Nang', countryName: 'Vietnam' }),
      feedItem(2, { countryName: 'Japan' }),
      feedItem(3, { name: 'Singapore in 5 days' }),
    ];
    await render(
      <PopularPlansSection items={items} onItemTapped={jest.fn()} onSeeAll={jest.fn()} />,
    );
    expect(screen.getByText('Da Nang')).toBeTruthy();
    expect(screen.getByText('Japan')).toBeTruthy();
    expect(screen.getByText('Singapore in 5 days')).toBeTruthy();
  });

  it('reports the tapped item', async () => {
    const onItemTapped = jest.fn();
    const items = [feedItem(1, { cityName: 'Da Nang' }), feedItem(2, { cityName: 'Hanoi' })];
    await render(
      <PopularPlansSection items={items} onItemTapped={onItemTapped} onSeeAll={jest.fn()} />,
    );
    await fireEvent.press(screen.getByTestId('popular-plan-2'));
    expect(onItemTapped).toHaveBeenCalledWith(items[1]);
  });

  it('reports "See all"', async () => {
    const onSeeAll = jest.fn();
    await render(
      <PopularPlansSection
        items={[feedItem(1, { cityName: 'Da Nang' })]}
        onItemTapped={jest.fn()}
        onSeeAll={onSeeAll}
      />,
    );
    await fireEvent.press(screen.getByText('See all'));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });
});
