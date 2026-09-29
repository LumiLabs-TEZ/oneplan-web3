import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { initI18n } from '@/i18n';

import type { MarketItem } from '../api/queries';
import { MarketPlanSection } from './MarketPlanSection';

const item = (id: number, dayNumber: number) =>
  ({
    id,
    dayNumber,
    startTime: '09:00',
    sortOrder: 0,
    title: `#${id}`,
    imageUrls: [],
  }) as unknown as MarketItem;

describe('MarketPlanSection editor mode', () => {
  beforeAll(() => {
    initI18n();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is read-only without the edit callbacks', async () => {
    const screen = await render(
      <MarketPlanSection items={[]} durationDays={2} onItemPress={jest.fn()} />,
    );
    expect(screen.queryByTestId('market-add-day-chip')).toBeNull();
    expect(screen.queryByTestId('market-new-plan')).toBeNull();
  });

  it('adds a plan to the selected day and a day while allowed', async () => {
    const onAddPlan = jest.fn();
    const onAddDay = jest.fn();
    const screen = await render(
      <MarketPlanSection
        items={[]}
        durationDays={2}
        onItemPress={jest.fn()}
        onAddPlan={onAddPlan}
        onAddDay={onAddDay}
        canAddDay
      />,
    );
    await fireEvent.press(screen.getByTestId('market-day-chip-2'));
    await fireEvent.press(screen.getByTestId('market-new-plan'));
    expect(onAddPlan).toHaveBeenCalledWith(2);
    await fireEvent.press(screen.getByTestId('market-add-day-chip'));
    expect(onAddDay).toHaveBeenCalled();
  });

  it('hides "+ add" at the day limit', async () => {
    const screen = await render(
      <MarketPlanSection
        items={[]}
        durationDays={30}
        onItemPress={jest.fn()}
        onAddDay={jest.fn()}
        canAddDay={false}
      />,
    );
    expect(screen.queryByTestId('market-add-day-chip')).toBeNull();
  });

  it('long-press confirms before deleting a day, only with more than one day', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onDeleteDay = jest.fn();
    const single = await render(
      <MarketPlanSection
        items={[item(1, 1)]}
        durationDays={1}
        onItemPress={jest.fn()}
        onDeleteDay={onDeleteDay}
      />,
    );
    await fireEvent(single.getByTestId('market-day-chip-1'), 'longPress');
    expect(alert).not.toHaveBeenCalled();
    await single.unmount();

    const screen = await render(
      <MarketPlanSection
        items={[item(1, 1), item(2, 2)]}
        durationDays={2}
        onItemPress={jest.fn()}
        onDeleteDay={onDeleteDay}
      />,
    );
    await fireEvent(screen.getByTestId('market-day-chip-2'), 'longPress');
    expect(onDeleteDay).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]![2] as AlertButton[];
    await act(() => buttons.find((button) => button.style === 'destructive')!.onPress!());
    expect(onDeleteDay).toHaveBeenCalledWith(2);
  });
});
