import { render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { MarketplaceFilterStrip } from './MarketplaceFilterStrip';

const menuMock = jest.requireMock('@react-native-menu/menu') as {
  __menuInstances: {
    actions: { id?: string; title: string; state?: string }[];
    onPressAction?: (event: { nativeEvent: { event: string } }) => void;
    testID?: string;
  }[];
  __resetMenuInstances: () => void;
};

function instance(testID: string) {
  const found = menuMock.__menuInstances.find((entry) => entry.testID === testID);
  if (!found) throw new Error(`no MenuView instance for ${testID}`);
  return found;
}

describe('MarketplaceFilterStrip', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    menuMock.__resetMenuInstances();
  });

  it('renders the generic chip names with the native menu actions behind them', async () => {
    const screen = await render(<MarketplaceFilterStrip filters={{}} onChange={jest.fn()} />);

    expect(screen.getByText('Duration')).toBeTruthy();
    expect(screen.getByText('Companion')).toBeTruthy();
    expect(screen.getByText('Budget')).toBeTruthy();

    expect(instance('market-filter-duration').actions).toEqual([
      { id: 'none', title: 'None', state: 'on' },
      { id: 'duration:0', title: '1-3 days', state: 'off' },
      { id: 'duration:1', title: '4-7 days', state: 'off' },
      { id: 'duration:2', title: '8-14 days', state: 'off' },
    ]);
    expect(instance('market-filter-companions').actions.map((action) => action.id)).toEqual([
      'none',
      'tag:COMPANY',
      'tag:COUPLES',
      'tag:FAMILY',
      'tag:FRIENDS',
      'tag:SOLO',
    ]);
    expect(instance('market-filter-budget').actions).toEqual([
      { id: 'none', title: 'None', state: 'on' },
      { id: 'budget:ASC', title: 'Ascending', state: 'off' },
      { id: 'budget:DESC', title: 'Descending', state: 'off' },
    ]);
  });

  it('shows the chosen value and checkmarks it (SwiftUI `title(for:)`)', async () => {
    const screen = await render(
      <MarketplaceFilterStrip
        filters={{ durationMinDays: 4, durationMaxDays: 7, tag: 'COUPLES', budgetSort: 'ASC' }}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByText('4-7 days')).toBeTruthy();
    expect(screen.getByText('Couples')).toBeTruthy();
    expect(screen.getByText('Ascending')).toBeTruthy();
    expect(instance('market-filter-duration').actions[2]).toEqual({
      id: 'duration:1',
      title: '4-7 days',
      state: 'on',
    });
    expect(instance('market-filter-companions').actions[2]).toEqual({
      id: 'tag:COUPLES',
      title: 'Couples',
      state: 'on',
    });
    expect(instance('market-filter-budget').actions[1]).toEqual({
      id: 'budget:ASC',
      title: 'Ascending',
      state: 'on',
    });
  });

  it('applies the chosen action through onChange and clears on None', async () => {
    const onChange = jest.fn();
    await render(<MarketplaceFilterStrip filters={{ tab: 'TRENDING' }} onChange={onChange} />);

    instance('market-filter-duration').onPressAction?.({
      nativeEvent: { event: 'duration:1' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      tab: 'TRENDING',
      durationMinDays: 4,
      durationMaxDays: 7,
    });

    instance('market-filter-companions').onPressAction?.({ nativeEvent: { event: 'tag:FAMILY' } });
    expect(onChange).toHaveBeenLastCalledWith({ tab: 'TRENDING', tag: 'FAMILY' });

    instance('market-filter-budget').onPressAction?.({
      nativeEvent: { event: 'budget:DESC' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ tab: 'TRENDING', budgetSort: 'DESC' });

    instance('market-filter-companions').onPressAction?.({ nativeEvent: { event: 'none' } });
    expect(onChange).toHaveBeenLastCalledWith({ tab: 'TRENDING', tag: undefined });
  });
});
