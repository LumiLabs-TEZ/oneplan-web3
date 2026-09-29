import { render } from '@testing-library/react-native';
import { View } from 'react-native';

import type { TripMenuItem } from '@/features/trip/helpers/tripMenu';

import { TripMenuButton, tripMenuActions } from './TripMenuButton';

const menuMock = jest.requireMock('@react-native-menu/menu') as {
  __menuInstances: {
    actions: unknown[];
    onPressAction?: (event: { nativeEvent: { event: string } }) => void;
    testID?: string;
  }[];
  __resetMenuInstances: () => void;
};

const items: TripMenuItem[] = [
  { id: 'groupCurrency', label: 'Group currency · đ', dimmed: true },
  { id: 'localCurrency', label: 'Local currency · Add' },
  { id: 'startTrip', label: 'Start Trip Now', divider: true },
  { id: 'deleteTrip', label: 'Delete trip', destructive: true, divider: true },
];

describe('tripMenuActions', () => {
  it('groups divider-separated rows into inline sections with SF Symbols on iOS', () => {
    expect(tripMenuActions(items, 'ios')).toEqual([
      {
        id: 'group-0',
        title: '',
        displayInline: true,
        subactions: [
          {
            id: 'groupCurrency',
            title: 'Group currency · đ',
            image: 'dollarsign.circle',
            imageColor: '#000000',
          },
          {
            id: 'localCurrency',
            title: 'Local currency · Add',
            image: 'airplane',
            imageColor: '#000000',
          },
        ],
      },
      {
        id: 'group-1',
        title: '',
        displayInline: true,
        subactions: [
          { id: 'startTrip', title: 'Start Trip Now', image: 'play.fill', imageColor: '#000000' },
        ],
      },
      {
        id: 'group-2',
        title: '',
        displayInline: true,
        subactions: [
          {
            id: 'deleteTrip',
            title: 'Delete trip',
            image: 'trash',
            imageColor: '#FF3B30',
            attributes: { destructive: true },
          },
        ],
      },
    ]);
  });

  it('keeps a single ungrouped section flat', () => {
    expect(tripMenuActions([{ id: 'leaveGroup', label: 'Leave group' }], 'ios')).toEqual([
      {
        id: 'leaveGroup',
        title: 'Leave group',
        image: 'rectangle.portrait.and.arrow.right',
        imageColor: '#000000',
      },
    ]);
  });

  it('keeps the inline groups on Android, with Ionicons instead of SF Symbols', () => {
    expect(tripMenuActions(items, 'android')).toEqual([
      {
        id: 'group-0',
        title: '',
        displayInline: true,
        subactions: [
          { id: 'groupCurrency', title: 'Group currency · đ', androidIcon: 'cash-outline' },
          { id: 'localCurrency', title: 'Local currency · Add', androidIcon: 'airplane-outline' },
        ],
      },
      {
        id: 'group-1',
        title: '',
        displayInline: true,
        subactions: [{ id: 'startTrip', title: 'Start Trip Now', androidIcon: 'play' }],
      },
      {
        id: 'group-2',
        title: '',
        displayInline: true,
        subactions: [
          {
            id: 'deleteTrip',
            title: 'Delete trip',
            androidIcon: 'trash-outline',
            attributes: { destructive: true },
          },
        ],
      },
    ]);
  });
});

describe('TripMenuButton', () => {
  beforeEach(() => menuMock.__resetMenuInstances());

  it('reports known row ids and ignores anything else', async () => {
    const onSelect = jest.fn();
    await render(
      <TripMenuButton items={items} onSelect={onSelect} testID="trip-menu-button">
        <View />
      </TripMenuButton>,
    );
    const menu = menuMock.__menuInstances.findLast((m) => m.testID === 'trip-menu-button')!;
    menu.onPressAction?.({ nativeEvent: { event: 'startTrip' } });
    menu.onPressAction?.({ nativeEvent: { event: 'group-0' } });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('startTrip');
  });
});
