import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import type { PlacePrediction } from '@/native/maps/placeSearch';

import type { RecentLocationDto } from '../api/recentLocations';
import { PlaceSearchList } from './PlaceSearchList';

beforeAll(() => {
  initI18n();
});

const PLACE: PlacePrediction = {
  placeId: 'fsq:1',
  name: 'Cafe X',
  address: '1 St',
  latitude: 10,
  longitude: 106,
  category: 'Coffee Shop',
};

const RECENT: RecentLocationDto = {
  id: 1,
  name: 'Old Place',
  address: null,
  lastViewedAt: '2026-01-01T00:00:00.000Z',
};

describe('PlaceSearchList', () => {
  it('renders "Recently viewed" + recent cards when the query is empty', async () => {
    await render(
      <PlaceSearchList
        query=""
        results={[]}
        recents={[RECENT]}
        suggested={[]}
        showSuggested={false}
        onSelectResult={jest.fn()}
        onSelectRecent={jest.fn()}
      />,
    );

    expect(screen.getByText('Recently viewed')).toBeTruthy();
    expect(screen.getByText('Old Place')).toBeTruthy();
    expect(screen.getByTestId('recent-row-0')).toBeTruthy();
  });

  it('shows the suggested strip alongside recents once a bias exists', async () => {
    await render(
      <PlaceSearchList
        query=""
        results={[]}
        recents={[]}
        suggested={[PLACE]}
        showSuggested
        onSelectResult={jest.fn()}
        onSelectRecent={jest.fn()}
      />,
    );

    expect(screen.getByText('Suggested for you')).toBeTruthy();
    expect(screen.getByText('Cafe X')).toBeTruthy();
    expect(screen.queryByText('Recently viewed')).toBeNull();
  });

  it('calls back with the tapped recent / suggested item', async () => {
    const onSelectRecent = jest.fn();
    const onSelectResult = jest.fn();
    await render(
      <PlaceSearchList
        query=""
        results={[]}
        recents={[RECENT]}
        suggested={[PLACE]}
        showSuggested
        onSelectResult={onSelectResult}
        onSelectRecent={onSelectRecent}
      />,
    );

    await fireEvent.press(screen.getByTestId('recent-row-0'));
    await fireEvent.press(screen.getByTestId('suggested-strip-card-0'));
    expect(onSelectRecent).toHaveBeenCalledWith(RECENT);
    expect(onSelectResult).toHaveBeenCalledWith(PLACE);
  });

  it('shows the empty illustration when there are no recents or suggestions', async () => {
    await render(
      <PlaceSearchList
        query=""
        results={[]}
        recents={[]}
        suggested={[PLACE]}
        showSuggested={false}
        onSelectResult={jest.fn()}
        onSelectRecent={jest.fn()}
      />,
    );

    expect(screen.getByText('Search for a place to get started')).toBeTruthy();
    expect(screen.queryByText('Suggested for you')).toBeNull();
  });

  it('shows a "keep typing" hint for queries under 2 characters', async () => {
    await render(
      <PlaceSearchList
        query="a"
        results={[]}
        recents={[RECENT]}
        suggested={[]}
        showSuggested={false}
        onSelectResult={jest.fn()}
        onSelectRecent={jest.fn()}
      />,
    );

    expect(screen.getByText('Keep typing')).toBeTruthy();
    expect(screen.queryByText('Old Place')).toBeNull();
  });

  it('renders search results (not recents) once the query is >= 2 characters', async () => {
    await render(
      <PlaceSearchList
        query="cafe"
        results={[PLACE]}
        recents={[RECENT]}
        suggested={[]}
        showSuggested={false}
        onSelectResult={jest.fn()}
        onSelectRecent={jest.fn()}
      />,
    );

    expect(screen.getByTestId('place-row-0')).toBeTruthy();
    expect(screen.getByText('Cafe X')).toBeTruthy();
    expect(screen.queryByText('Recently viewed')).toBeNull();
    expect(screen.queryByText('Old Place')).toBeNull();
  });

  it('shows a "no locations found" empty state when a settled search has no results', async () => {
    await render(
      <PlaceSearchList
        query="zzz"
        results={[]}
        recents={[]}
        suggested={[]}
        showSuggested={false}
        onSelectResult={jest.fn()}
        onSelectRecent={jest.fn()}
      />,
    );

    expect(screen.getByText('No locations found')).toBeTruthy();
  });
});
